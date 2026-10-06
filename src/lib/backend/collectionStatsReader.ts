import { cache } from "react";
import { listCollectedRuns } from "./collectionRuns";
import { getRunOutcome } from "./collectionRunsTypes";
import { processStoredPromptRuns as processPromptRuns } from "./database/analysis";
import { formatWeekLabel, toUtcSundayWeekStart } from "./processing/date";
import { brandPatterns } from "./processing/text";
import { brandQueryKeywords, queryScopeOf, type QueryScope } from "@/lib/queryScope";
import { MIN_RELIABLE_RUNS, pointTrend, pooledRate, weightedAverage, wilsonLowerBound } from "@/lib/visibilityStats";
import { nameKey, type BrandEvidence } from "@/lib/brandOptimization";
import { getPromptTopicGroups } from "./promptTopics";
import { seedLlmModels, seedMarkets } from "@/lib/db/data/seed";
import { getRealBrandSeeds } from "./brandSeeds";
import { getCurrentTenant } from "./tenant";
import {
  BrandRankRow,
  BrandWeeklyPoint,
  CitedDomainRow,
  CollectionQualityRow,
  ModelTopicMatrix,
  CitedPageRow,
  CitedSourceRow,
  DataInsightRow,
  DateRange,
  MarketComparisonRow,
  OwnCitedUrlRow,
  PromptMetricsPoint,
  PromptRunSeed,
  RankedRow,
  Sentiment,
  SentimentMoverRow,
  SentimentWeek,
  ShareOfVoiceRow,
  CitedPromptRun,
  StatCard,
  StrategyBrandMention,
  ThirdPartyUrlRow,
  TopicPromptRow,
  TopicRow,
  TopicVisibilityFunnel,
  UrlInspectorData,
} from "@/lib/db/types";

// Server-only (pulls in collectionRuns.ts, which uses node:fs) — call only
// from a server component/route, never a "use client" file.
const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };
// 현재 조직과 그 조직의 자사 브랜드(헤더 선택, tenant.ts) — 예전엔 Neodigm
// 고정 상수였다. 이 모듈은 서버 컴포넌트/라우트에서만 쓰이므로 요청 컨텍스트를
// 읽어도 된다.
const currentScope = cache(async () => {
  const tenant = await getCurrentTenant();
  return { orgId: tenant.orgId, ownBrandId: tenant.brandId };
});

const COMPANY_SUFFIX_PATTERN =
  "(?:AI|CRM|SEO|GEO|LLMO|SaaS|Labs?|Studio|Cloud|Hub|Works|Marketing|Automation|Analytics|Search|Console|Ads|Suite|Platform|Partners?|Agency|Group|Inc\\.?|Corp\\.?|Corporation|Co\\.?|Company|Solutions|Technologies|테크|랩스|소프트|마케팅|파트너스|컴퍼니|그룹)";
const COMPANY_NAME_RE = new RegExp(
  `\\b([A-Z][A-Za-z0-9&.+-]*(?:\\s+[A-Z][A-Za-z0-9&.+-]*){0,3}\\s+${COMPANY_SUFFIX_PATTERN}|[A-Z][A-Za-z0-9&.+-]{2,}(?:\\s+[A-Z][A-Za-z0-9&.+-]{2,}){0,2})\\b`,
  "g"
);
// 신규 업체 후보로 인정하려면 서로 다른 답변 몇 개에서 나와야 하는지.
const MIN_DETECTED_ANSWERS = 2;
const DETECTED_ANSWERS_SHARE = 0.02;
const COMPANY_BLOCKLIST = new Set([
  // 직책·플랫폼 속성·일반 개념어 — 회사 이름이 아닌데 대문자 단어 규칙에 걸리는 것들
  "CIO",
  "CEO",
  "CTO",
  "CMO",
  "CFO",
  "CISO",
  "Naver Blog",
  "Naver Cafe",
  "Lead Scoring",
  "Scoring",
  "Content",
  "Account Management",
  "Account-Based Marketing",
  "AI",
  "API",
  "B2B",
  "CRM",
  "FAQ",
  "GEO",
  "GSC",
  "HTML",
  "LLM",
  "LLMO",
  "SEO",
  "URL",
  "Google",
  "Google Search",
  "Google Search Console",
  "Naver",
  "ChatGPT",
  "Gemini",
  "Claude",
  "Perplexity",
  "Sales",
  "Marketing",
  "Automation",
  "Nurturing",
  "Business",
  "Lead",
  "Lead Generation",
  "ERP",
]);

export interface RealMetric {
  value: number;
  trend: StatCard["trend"];
  sparkline: StatCard["sparkline"];
  label?: string;
  description?: string;
  decimals?: number;
  suffix?: string;
  trendUnit?: StatCard["trendUnit"];
  caption?: string;
}

export interface RealStatSeries {
  visibilityScore: RealMetric;
  brandMentions: RealMetric;
  citations: RealMetric;
}

function trend(current: number, previous: number | undefined): StatCard["trend"] {
  if (previous === undefined || previous === 0) return { direction: "flat", percent: 0 };
  const percent = Math.round(((current - previous) / previous) * 100);
  return { direction: percent === 0 ? "flat" : percent > 0 ? "up" : "down", percent: Math.abs(percent) };
}

function normalizeDetectedCompanyName(value: string) {
  return value
    .replace(/[“”"'`()[\]{}]/g, "")
    .replace(/[,.。]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contextAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + length + 140);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "..." : ""}`;
}

function normalizeDomain(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/^www\./, "");
}

function compactCompanyName(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9가-힣]/g, "");
}

function evidenceDomainForCandidate(name: string, domains: string[]) {
  const compact = compactCompanyName(name);
  if (compact.length < 3) return null;
  return (
    domains.find((domain) => {
      const labels = normalizeDomain(domain).split(".");
      const registrable = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
      return registrable === compact || compact.includes(registrable);
    }) ?? null
  );
}

function detectCompanyCandidates(text: string, knownBrandNames: Set<string>, citationDomains: string[]) {
  const candidates = new Map<string, { name: string; count: number; sampleContext: string; evidenceDomain: string }>();
  for (const match of text.matchAll(COMPANY_NAME_RE)) {
    if (match.index === undefined) continue;
    const name = normalizeDetectedCompanyName(match[1]);
    if (name.length < 3 || name.length > 60) continue;
    if (COMPANY_BLOCKLIST.has(name) || knownBrandNames.has(name.toLocaleLowerCase("ko-KR"))) continue;
    if (/^(?:The|This|That|For|And|But|With|Without|When|Where|How|What|Why)\b/.test(name)) continue;
    const evidenceDomain = evidenceDomainForCandidate(name, citationDomains);
    if (!evidenceDomain) continue;

    const key = name.toLocaleLowerCase("ko-KR");
    const current = candidates.get(key);
    candidates.set(key, {
      name: current?.name ?? name,
      count: (current?.count ?? 0) + 1,
      sampleContext: current?.sampleContext ?? contextAround(text, match.index, match[1].length),
      evidenceDomain: current?.evidenceDomain ?? evidenceDomain,
    });
  }
  return [...candidates.values()];
}

export interface RealDataFilters {
  /** Overview's "플랫폼" 필터 — PromptRunSeed.llmModelId matches the seed
   *  LLM model list 1:1, so it's safe to apply directly to real runs. */
  llmModelId?: string;
  /** Overview's "카테고리" 필터 — collected runs don't get a category at
   *  collection time (수집 로그 폼은 키워드만 받음), so this matches whatever
   *  was tagged afterward via the run's "분석" 모달(rawMetadata.category,
   *  Brand Management/Prompt Library와 같은 목록). 아직 분류 안 된 실행은
   *  어떤 카테고리를 골라도 매칭되지 않는다. */
  category?: string;
  /** Overview's "마켓" 필터 — collector scripts already tag every run with a
   *  real seedMarkets id (--market-id, default market-kr) at collection
   *  time, and Brand Management's `markets` now uses the same seedMarkets
   *  labels (brandsManagement.ts), so this applies directly — no post-hoc
   *  tagging step needed, unlike category. */
  marketId?: string;
  /** Overview's "질의" 필터 — 자사 브랜드명이 들어간 질의("brand")만 / 아닌 질의
   *  ("nonbrand")만. 질의(rawMetadata.query)가 없는 실행은 어느 쪽에도 안 들어간다. */
  queryScope?: QueryScope;
}

function ownBrandKeywords(brands: { isOwnBrand: boolean; name: string; domain: string; aliases: string[] }[]) {
  const own = brands.find((b) => b.isOwnBrand);
  return own ? brandQueryKeywords(own) : [];
}

// Shared by every getReal* below — same processed mentions/citations
// bucketed by the run's week, just aggregated differently per caller.
// Returns null when nothing's been collected yet (or nothing survives the
// filter), so callers fall back to the seeded mock.
// Wrapped in React's per-request cache: Overview alone calls this three times
// (stat cards, sentiment, market comparison) with the same range+filters —
// without this they'd each independently re-fetch and re-analyze every
// collected run.
const getProcessedWithWeeks = cache(async (range: DateRange, filters: RealDataFilters = {}) => {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const brands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const brandKeywords = ownBrandKeywords(brands);
  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId)
    .filter((run) => !filters.queryScope || queryScopeOf(run.rawMetadata.query, brandKeywords) === filters.queryScope);
  if (promptRuns.length === 0) return null;

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands });

  const weekOfRun = new Map<string, string>();
  for (const run of promptRuns) {
    if (run.status !== "success") continue;
    weekOfRun.set(run.id, toUtcSundayWeekStart(run.runAt));
  }

  const weeks = Array.from(new Set(weekOfRun.values())).sort();
  if (weeks.length === 0) return null;

  const windowSize = RANGE_WEEKS[range];
  const currentWeeks = weeks.slice(-windowSize);
  const previousWeeks = weeks.slice(-windowSize * 2, -windowSize);
  const runsById = new Map(promptRuns.map((run) => [run.id, run]));
  return { processed, weekOfRun, currentWeeks, previousWeeks, runsById, brands, brandKeywords };
});

// Same "우리 브랜드가 언급된 프롬프트 실행의 감성" the mentions pipeline
// already classifies per-run (see processing/mentions.ts) — just bucketed
// by week for the chart instead of by stat-card total. Returns null when
// nothing's been collected yet, so Overview falls back to the seeded chart.
export async function getRealSentimentSeries(range: DateRange, filters: RealDataFilters = {}): Promise<SentimentWeek[] | null> {
  const { ownBrandId: OWN_BRAND_ID } = await currentScope();
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks } = result;

  const byWeek = new Map(currentWeeks.map((w) => [w, { positive: 0, neutral: 0, negative: 0 }]));
  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    const bucket = week ? byWeek.get(week) : undefined;
    if (bucket) bucket[mention.sentiment] += 1;
  }

  // SentimentChart는 mock 데이터처럼 positive+neutral+negative가 100이 되는
  // "그 주 언급 중 비율(%)"을 기대한다 — 건수를 그대로 넘기면 축 라벨("%")과
  // 실제 값(예: 2, 1, 0)이 안 맞아 차트가 거의 0으로 보인다.
  return currentWeeks.map((w) => {
    const counts = byWeek.get(w)!;
    const total = counts.positive + counts.neutral + counts.negative;
    if (total === 0) return { week: formatWeekLabel(w), positive: 0, neutral: 0, negative: 0 };
    const positive = Math.round((counts.positive / total) * 100);
    const negative = Math.round((counts.negative / total) * 100);
    const neutral = 100 - positive - negative;
    return { week: formatWeekLabel(w), positive, neutral, negative };
  });
}

// Mentions/citations already carry a brandId for every tracked brand, not
// just our own (see processing/mentions.ts + citations.ts), so market
// comparison is just the same real pipeline aggregated per brand instead
// of filtered to OWN_BRAND_ID. Returns null when nothing's been collected.
export async function getRealMarketComparison(range: DateRange, filters: RealDataFilters = {}): Promise<MarketComparisonRow[] | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, brands } = result;
  const currentWeekSet = new Set(currentWeeks);

  // 개수가 아니라 "기간 내 성공 실행 중 그 브랜드가 언급(인용)된 실행의 비율(%)" —
  // 수집량이 달라도 브랜드끼리·기간끼리 비교할 수 있고, 한 답변에서 여러 번 나와도 1로 센다.
  let totalRuns = 0;
  for (const week of weekOfRun.values()) if (currentWeekSet.has(week)) totalRuns += 1;
  if (totalRuns === 0) return null;

  const byBrand = new Map<string, { brand: string; isSelf: boolean; mentionRuns: Set<string>; citationRuns: Set<string> }>();
  for (const brand of brands) {
    byBrand.set(brand.id, { brand: brand.name, isSelf: brand.isOwnBrand, mentionRuns: new Set(), citationRuns: new Set() });
  }

  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    byBrand.get(mention.brandId)?.mentionRuns.add(mention.promptRunId);
  }

  for (const citation of processed.citations) {
    if (!citation.brandId) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    byBrand.get(citation.brandId)?.citationRuns.add(citation.promptRunId);
  }

  return Array.from(byBrand.values())
    .filter((row) => row.mentionRuns.size > 0 || row.citationRuns.size > 0)
    .map((row) => ({
      brand: row.brand,
      isSelf: row.isSelf,
      mentions: pooledRate([{ hit: row.mentionRuns.size, total: totalRuns }]),
      citations: pooledRate([{ hit: row.citationRuns.size, total: totalRuns }]),
    }))
    .sort((a, b) => b.mentions - a.mentions || b.citations - a.citations);
}

// Builds the same 3 real-data-backed metrics (visibility score, brand
// mentions, citations) the collection-runs page already computes on the
// fly from actual collected files — bucketed by week so Overview's range
// filter (1w/2w/4w) and trend-vs-previous-period behave the same as the
// mock snapshot path it replaces. Returns null when nothing's been
// collected yet, so the caller can fall back to the seeded snapshot cards.
export async function getRealStatSeries(range: DateRange, filters: RealDataFilters = {}): Promise<RealStatSeries | null> {
  const { ownBrandId: OWN_BRAND_ID } = await currentScope();
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, previousWeeks, runsById, brandKeywords } = result;

  const allWeeks = Array.from(new Set([...currentWeeks, ...previousWeeks]));
  const mentionedRunsByWeek = new Map<string, Set<string>>(allWeeks.map((w) => [w, new Set()]));
  const citedRunsByWeek = new Map<string, Set<string>>(allWeeks.map((w) => [w, new Set()]));
  const runsByWeek = new Map<string, number>(allWeeks.map((w) => [w, 0]));
  // 가시성 점수 가중치 — 주차·모델·마켓 그룹별 성공 실행 수.
  const runsByGroup = new Map<string, number>();

  for (const [runId, week] of weekOfRun) {
    if (!runsByWeek.has(week)) continue;
    runsByWeek.set(week, (runsByWeek.get(week) ?? 0) + 1);
    const run = runsById.get(runId);
    if (run) {
      const key = `${week}:${run.llmModelId}:${run.marketId}`;
      runsByGroup.set(key, (runsByGroup.get(key) ?? 0) + 1);
    }
  }

  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (week) mentionedRunsByWeek.get(week)?.add(mention.promptRunId);
  }

  for (const citation of processed.citations) {
    if (!citation.isOwnDomain) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (week) citedRunsByWeek.get(week)?.add(citation.promptRunId);
  }

  const visibilityByWeek = new Map<string, { value: number; weight: number }[]>(allWeeks.map((w) => [w, []]));
  for (const score of processed.visibilityScores) {
    const weight = runsByGroup.get(`${score.weekStart}:${score.llmModelId}:${score.marketId}`) ?? 1;
    visibilityByWeek.get(score.weekStart)?.push({ value: score.totalScore, weight });
  }

  // 주 목록 → (적중 실행 수, 전체 실행 수) — 프롬프트를 늘려도 비율은 그대로.
  const parts = (weeks: string[], hits: Map<string, Set<string>>) =>
    weeks.map((w) => ({ hit: hits.get(w)?.size ?? 0, total: runsByWeek.get(w) ?? 0 }));
  const sumOf = (list: { hit: number; total: number }[], key: "hit" | "total") => list.reduce((s, p) => s + p[key], 0);
  // 브랜드 질의/일반 질의로 나눈 비율 — 이미 한쪽으로 필터한 화면에서는 생략.
  const scopeSplit = (hits: Map<string, Set<string>>): string => {
    if (filters.queryScope) return "";
    const tally = { brand: { hit: 0, total: 0 }, nonbrand: { hit: 0, total: 0 } };
    for (const w of currentWeeks) {
      for (const [runId, week] of weekOfRun) {
        if (week !== w) continue;
        const scope = queryScopeOf(runsById.get(runId)?.rawMetadata.query, brandKeywords);
        if (!scope) continue;
        tally[scope].total += 1;
        if (hits.get(w)?.has(runId)) tally[scope].hit += 1;
      }
    }
    if (tally.brand.total === 0 || tally.nonbrand.total === 0) return "";
    return ` · 일반 질의 ${pooledRate([tally.nonbrand])}% / 브랜드 질의 ${pooledRate([tally.brand])}%`;
  };
  const rateMetric = (hits: Map<string, Set<string>>, label: string, description: string, unitLabel: string): RealMetric => {
    const current = parts(currentWeeks, hits);
    const previous = parts(previousWeeks, hits);
    const value = pooledRate(current);
    const total = sumOf(current, "total");
    const low = total < MIN_RELIABLE_RUNS;
    return {
      label,
      description,
      value,
      decimals: 1,
      suffix: "%",
      trendUnit: "%p",
      caption: `${unitLabel} ${sumOf(current, "hit").toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")}개 실행${low ? " · 표본 적음" : ""}${scopeSplit(hits)}`,
      trend: pointTrend(value, previousWeeks.length ? pooledRate(previous) : undefined),
      sparkline: currentWeeks.map((w, i) => ({ week: formatWeekLabel(w), value: pooledRate([current[i]]) })),
    };
  };

  const weightedOf = (weeks: string[]) => weightedAverage(weeks.flatMap((w) => visibilityByWeek.get(w) ?? []));
  const currentVis = weightedOf(currentWeeks);
  const previousVis = weightedOf(previousWeeks);
  const currentRuns = currentWeeks.reduce((s, w) => s + (runsByWeek.get(w) ?? 0), 0);

  return {
    visibilityScore: {
      value: currentVis,
      trend: trend(currentVis, previousWeeks.length ? previousVis : undefined),
      caption: `실행 ${currentRuns.toLocaleString("ko-KR")}개 가중 평균${currentRuns < MIN_RELIABLE_RUNS ? " · 표본 적음" : ""}`,
      sparkline: currentWeeks.map((w) => ({ week: formatWeekLabel(w), value: weightedAverage(visibilityByWeek.get(w) ?? []) })),
    },
    brandMentions: rateMetric(
      mentionedRunsByWeek,
      "브랜드 언급률",
      "선택 기간에 수집한 AI 답변 중 우리 브랜드가 언급된 답변의 비율이에요. 수집한 프롬프트 수가 늘어도 비율은 그대로라 기간·수집량이 달라도 비교할 수 있어요. 그래프는 주별 언급률이에요.",
      "언급"
    ),
    citations: rateMetric(
      citedRunsByWeek,
      "인용률",
      "선택 기간에 수집한 AI 답변 중 우리 도메인이 출처로 인용된 답변의 비율이에요. 한 답변에 여러 번 인용돼도 1건으로 세요. 그래프는 주별 인용률이에요.",
      "인용"
    ),
  };
}

export interface RealRankedTabs {
  /** 우리 브랜드가 언급된 횟수, 그룹(모델/마켓)별. */
  mentions: RankedRow[];
  /** 그 그룹에서 실행된 프롬프트 중 우리 브랜드가 언급된 비율(%) — 모델/
   *  마켓별 "적중률"에 해당하는, mentions/exposure로 정의한 지표. */
  visibility: RankedRow[];
  /** 그 그룹에서 실행된 프롬프트(수집 실행) 총량 — 언급 여부와 무관하게
   *  얼마나 그 모델/마켓에 노출(실행)됐는지. */
  exposure: RankedRow[];
}

// Visibility Overview's "Mentions by Model"/"Mentions by Market" 패널의 3개
// 탭을 전부 실 데이터로 계산 — 모델/마켓별로 그룹화해 언급 수(mentions),
// 언급 비율(visibility = mentions/exposure), 총 실행 수(exposure)를 한 번에
// 구한다.
async function getRealRankedTabs(
  range: DateRange,
  groupKey: (run: { llmModelId: string; marketId: string }) => string | undefined,
  filters: RealDataFilters
): Promise<RealRankedTabs | null> {
  const { ownBrandId: OWN_BRAND_ID } = await currentScope();
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, runsById } = result;
  const currentWeekSet = new Set(currentWeeks);

  const mentionByGroup = new Map<string, number>();
  const exposureByGroup = new Map<string, number>();

  for (const run of runsById.values()) {
    const week = weekOfRun.get(run.id);
    if (!week || !currentWeekSet.has(week)) continue;
    const group = groupKey(run);
    if (!group) continue;
    exposureByGroup.set(group, (exposureByGroup.get(group) ?? 0) + 1);
  }

  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const run = runsById.get(mention.promptRunId);
    const group = run && groupKey(run);
    if (!group) continue;
    mentionByGroup.set(group, (mentionByGroup.get(group) ?? 0) + 1);
  }
  if (exposureByGroup.size === 0) return null;

  const totalMentions = Array.from(mentionByGroup.values()).reduce((s, v) => s + v, 0);
  const totalExposure = Array.from(exposureByGroup.values()).reduce((s, v) => s + v, 0);

  const groups = Array.from(exposureByGroup.keys());
  const toRow = (
    label: string,
    value: number,
    displayOf: (value: number) => string
  ): RankedRow => ({ label, value, display: displayOf(value) });

  const mentions = groups
    .map((label) => toRow(label, mentionByGroup.get(label) ?? 0, (v) => `${v} (${Math.round((v / (totalMentions || 1)) * 100)}%)`))
    .sort((a, b) => b.value - a.value);
  const visibility = groups
    .map((label) => {
      const exposure = exposureByGroup.get(label) ?? 0;
      const pct = exposure > 0 ? Math.round(((mentionByGroup.get(label) ?? 0) / exposure) * 100) : 0;
      return toRow(label, pct, (v) => `${v}%`);
    })
    .sort((a, b) => b.value - a.value);
  const exposure = groups
    .map((label) => toRow(label, exposureByGroup.get(label) ?? 0, (v) => `${v} (${Math.round((v / (totalExposure || 1)) * 100)}%)`))
    .sort((a, b) => b.value - a.value);

  return { mentions, visibility, exposure };
}

export async function getRealMentionsByModel(range: DateRange, filters: RealDataFilters = {}): Promise<RealRankedTabs | null> {
  return getRealRankedTabs(range, (run) => seedLlmModels.find((m) => m.id === run.llmModelId)?.name, filters);
}

export async function getRealMentionsByMarket(range: DateRange, filters: RealDataFilters = {}): Promise<RealRankedTabs | null> {
  return getRealRankedTabs(range, (run) => seedMarkets.find((m) => m.id === run.marketId)?.label, filters);
}

export interface RealTopicRows {
  /** Visibility Overview's "top-prompts" category — 실행 중 우리 브랜드가
   *  한 번이라도 언급된 쿼리들. */
  topPrompts: TopicRow[];
  /** "topic-opportunities" 카테고리 — 언급이 한 번도 없었던 쿼리들. */
  opportunities: TopicRow[];
}

// Visibility Overview의 토픽 테이블은 원래 seedTopics(고정 8개 토픽 id)를
// 기준으로 짜여 있는데, 실 수집 데이터는 그 id 체계를 전혀 모른다 — 대신
// "수집 로그"에 입력한 키워드(rawMetadata.query)가 사실상의 "토픽"이다.
// 나중에 스케줄러가 프롬프트 라이브러리의 프롬프트를 그대로 --query로 돌리게
// 되면 이 query 값이 곧 그 프롬프트 텍스트가 되므로, 지금 이 그룹화 방식을
// 그대로 쓸 수 있다 — 수동 키워드 수집이든 향후 배치 수집이든 같은 필드
// (rawMetadata.query)만 채우면 자동으로 여기 반영된다. 주(week) 단위로
// 거르지 않는 전체 기간 집계 — 토픽 테이블 자체가 range 필터를 안 받는다.
export interface TopicOpportunityExtras {
  /** 이미 프롬프트 라이브러리에 있는 프롬프트 문장 전체 — addedToLibrary 판정용. */
  libraryPrompts?: string[];
  /** 토픽 텍스트 → 그 토픽용으로 만든 콘텐츠 URL. */
  targetUrls?: Record<string, string>;
}

export async function getRealTopicRows(
  filters: RealDataFilters = {},
  extras: TopicOpportunityExtras = {}
): Promise<RealTopicRows | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const topicBrands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const topicBrandKeywords = ownBrandKeywords(topicBrands);
  const inScope = (run: PromptRunSeed) => !filters.queryScope || queryScopeOf(run.rawMetadata.query, topicBrandKeywords) === filters.queryScope;
  const scopedRuns = promptRuns.filter(inScope);
  if (scopedRuns.length === 0) return null;
  promptRuns.splice(0, promptRuns.length, ...scopedRuns);

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: topicBrands });
  const runsById = new Map(promptRuns.map((run) => [run.id, run]));

  const ownMentionByRun = new Map<string, boolean>();
  const otherMentionCountByRun = new Map<string, number>();
  for (const mention of processed.mentions) {
    if (mention.brandId === OWN_BRAND_ID) {
      ownMentionByRun.set(mention.promptRunId, mention.isPresent);
    } else if (mention.isPresent) {
      otherMentionCountByRun.set(mention.promptRunId, (otherMentionCountByRun.get(mention.promptRunId) ?? 0) + 1);
    }
  }
  const citationCountByRun = new Map<string, number>();
  for (const citation of processed.citations) {
    citationCountByRun.set(citation.promptRunId, (citationCountByRun.get(citation.promptRunId) ?? 0) + 1);
  }

  const runIdsByQuery = new Map<string, string[]>();
  for (const run of promptRuns) {
    const query = run.rawMetadata.query?.trim();
    if (!query) continue;
    const list = runIdsByQuery.get(query) ?? [];
    list.push(run.id);
    runIdsByQuery.set(query, list);
  }
  if (runIdsByQuery.size === 0) return null;

  // Visibility Funnel(AI Existence 포함)은 status="success"만 보는 위
  // promptRuns로는 계산할 수 없다 — "AI가 애초에 답을 안 만든" 실행은
  // status가 "failed"로 뭉뚱그려져 저기서 이미 걸러졌기 때문이다. 같은
  // 필터(엔진/카테고리/마켓)를 상태 무관하게 다시 적용해 쿼리별 전체
  // 실행을 따로 모은다 — 토픽 발견 자체는 여전히 success 기준(위)이라
  // 범위가 넓어지지 않는다.
  const allRunsByQuery = new Map<string, PromptRunSeed[]>();
  for (const f of runFiles) {
    const run = f.promptRun;
    if (filters.llmModelId && run.llmModelId !== filters.llmModelId) continue;
    if (filters.category && run.rawMetadata.category !== filters.category) continue;
    if (filters.marketId && run.marketId !== filters.marketId) continue;
    if (!inScope(run)) continue;
    const query = run.rawMetadata.query?.trim();
    if (!query) continue;
    const list = allRunsByQuery.get(query) ?? [];
    list.push(run);
    allRunsByQuery.set(query, list);
  }

  // targetUrl 인용 트래킹용 — 이 필터 범위 안의 전체 수집(이 토픽의 실행뿐
  // 아니라 전부) 기준으로 그 URL이 실제로 몇 번 인용됐는지 센다. "이
  // 콘텐츠가 AI 답변에 인용되는가"는 원래 프롬프트가 아니라 다른
  // 프롬프트에서도 인용될 수 있어서 전체 집합에서 세는 게 맞다.
  const citationCountByPageUrl = new Map<string, number>();
  for (const c of processed.citations) {
    citationCountByPageUrl.set(c.pageUrl, (citationCountByPageUrl.get(c.pageUrl) ?? 0) + 1);
  }
  const libraryPromptSet = new Set((extras.libraryPrompts ?? []).map((p) => p.trim().toLowerCase()));

  // 여러 프롬프트를 하나의 "토픽"으로 묶는 그룹핑 — LLM API 연동 전까지는
  // LlmBridgeModal(scope "prompt-topic-groups")로 사람이 채운다. 아직 안
  // 묶인 프롬프트는 자기 자신 하나짜리 토픽으로 남는다(types.ts 정의 참고).
  const topicGroups = await getPromptTopicGroups(ORG_ID);
  const topicOfQuery = new Map<string, string>();
  for (const group of topicGroups) {
    for (const p of group.prompts) topicOfQuery.set(p.trim(), group.topic);
  }
  for (const run of promptRuns) {
    if (run.rawMetadata.query && run.rawMetadata.topic) topicOfQuery.set(run.rawMetadata.query.trim(), run.rawMetadata.topic);
  }
  const queriesByTopic = new Map<string, string[]>();
  for (const query of runIdsByQuery.keys()) {
    const topic = topicOfQuery.get(query) ?? query;
    const list = queriesByTopic.get(topic) ?? [];
    list.push(query);
    queriesByTopic.set(topic, list);
  }

  const topPrompts: TopicRow[] = [];
  const opportunities: TopicRow[] = [];

  for (const [topic, queries] of queriesByTopic) {
    const runIds = queries.flatMap((q) => runIdsByQuery.get(q)!);
    const mentionCount = runIds.filter((id) => ownMentionByRun.get(id)).length;
    const firstRun = runsById.get(runIds[0])!;
    const market = seedMarkets.find((m) => m.id === firstRun.marketId)?.label ?? firstRun.marketId;

    const prompts: TopicPromptRow[] = runIds
      .map((id) => {
        const run = runsById.get(id)!;
        const query = run.rawMetadata.query!.trim();
        return {
          id,
          prompt: query,
          model: seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId,
          myBrand: ownMentionByRun.get(id) ? "노출" : "미노출",
          brand: String(otherMentionCountByRun.get(id) ?? 0),
          source: String(citationCountByRun.get(id) ?? 0),
          market: seedMarkets.find((m) => m.id === run.marketId)?.label ?? run.marketId,
          runAt: run.runAt,
          addedToLibrary: libraryPromptSet.size > 0 ? libraryPromptSet.has(query.toLowerCase()) : undefined,
        };
      })
      .sort((a, b) => (a.runAt ?? "").localeCompare(b.runAt ?? ""));

    const targetUrl = extras.targetUrls?.[topic];

    const allRuns = queries.flatMap((q) => allRunsByQuery.get(q) ?? []);
    const outcomes = allRuns.map((run) => ({ run, outcome: getRunOutcome(run) }));
    const totalResponses = outcomes.filter(({ outcome }) => outcome !== "collection-error").length;
    const aiExistResponses = outcomes.filter(({ outcome }) => outcome === "ai-answered").length;
    const commercialOpportunityResponses = runIds.filter(
      (id) => ownMentionByRun.get(id) || (otherMentionCountByRun.get(id) ?? 0) > 0
    ).length;
    const funnel: TopicVisibilityFunnel = {
      totalResponses,
      aiExistResponses,
      commercialOpportunityResponses,
      mentionedResponses: mentionCount,
    };

    const row: TopicRow = {
      id: `real-${topic}`,
      topic,
      mentions: mentionCount,
      visibility: Math.round((mentionCount / runIds.length) * 100),
      market,
      prompts,
      funnel,
      addedToLibrary:
        libraryPromptSet.size > 0 ? queries.some((q) => libraryPromptSet.has(q.trim().toLowerCase())) : undefined,
      targetUrl,
      targetUrlCitations: targetUrl ? (citationCountByPageUrl.get(targetUrl) ?? 0) : undefined,
      createdAt: prompts[0]?.runAt,
    };

    (mentionCount > 0 ? topPrompts : opportunities).push(row);
  }

  // 언급 "개수"로 정렬하면 많이 돌린 토픽이 위로 올라온다 — 가시성(언급 실행 /
  // 전체 실행)을 표본 크기까지 반영한 신뢰구간 하한으로 정렬한다.
  topPrompts.sort(
    (a, b) =>
      wilsonLowerBound(b.mentions, b.prompts.length) - wilsonLowerBound(a.mentions, a.prompts.length) ||
      b.mentions - a.mentions
  );
  // 언급이 0인 토픽은 가시성이 모두 0%라, 0%를 더 많이 확인한(실행이 많은) 토픽을 앞에 둔다.
  opportunities.sort((a, b) => b.prompts.length - a.prompts.length);

  if (topPrompts.length === 0 && opportunities.length === 0) return null;
  return { topPrompts, opportunities };
}

// ---- Brand Presence page ----

// 주간×브랜드별 언급률/인용률(%) — "마켓 트래킹" 차트가 필요로 하는 shape
// (BrandWeeklyPoint: { week, [brand]: number, ... }). 개수가 아니라 "그 주
// 성공 실행 중 그 브랜드가 언급(인용)된 실행의 비율"이라 주별 수집량이
// 달라도 추이를 비교할 수 있다. 한 실행에서 여러 번 나와도 1로 센다.
export async function getRealMarketWeeklyTracking(
  range: DateRange,
  filters: RealDataFilters = {}
): Promise<{ mentionsByWeek: BrandWeeklyPoint[]; citationsByWeek: BrandWeeklyPoint[] } | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, brands } = result;
  const currentWeekSet = new Set(currentWeeks);

  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
  const runsByWeek = new Map<string, number>(currentWeeks.map((w) => [w, 0]));
  for (const week of weekOfRun.values()) {
    if (currentWeekSet.has(week)) runsByWeek.set(week, (runsByWeek.get(week) ?? 0) + 1);
  }
  const mentionedRuns = new Map<string, Map<string, Set<string>>>(currentWeeks.map((w) => [w, new Map()]));
  const citedRuns = new Map<string, Map<string, Set<string>>>(currentWeeks.map((w) => [w, new Map()]));
  const addRun = (byWeek: Map<string, Map<string, Set<string>>>, week: string, brand: string, runId: string) => {
    const map = byWeek.get(week)!;
    const set = map.get(brand) ?? new Set<string>();
    set.add(runId);
    map.set(brand, set);
  };

  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const brand = brandNameById.get(mention.brandId);
    if (brand) addRun(mentionedRuns, week, brand, mention.promptRunId);
  }
  for (const citation of processed.citations) {
    if (!citation.brandId) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const brand = brandNameById.get(citation.brandId);
    if (brand) addRun(citedRuns, week, brand, citation.promptRunId);
  }

  const toPoints = (byWeek: Map<string, Map<string, Set<string>>>): BrandWeeklyPoint[] =>
    currentWeeks.map((w) => {
      const point: BrandWeeklyPoint = { week: formatWeekLabel(w) };
      const total = runsByWeek.get(w) ?? 0;
      for (const [brand, runIds] of byWeek.get(w) ?? []) point[brand] = pooledRate([{ hit: runIds.size, total }]);
      return point;
    });

  const mentions = toPoints(mentionedRuns);
  const citations = toPoints(citedRuns);
  const hasAny = mentions.some((p) => Object.keys(p).length > 1) || citations.some((p) => Object.keys(p).length > 1);
  if (!hasAny) return null;
  return { mentionsByWeek: mentions, citationsByWeek: citations };
}

// 검색어 트렌드 교차 분석용 — 수집된 전체 기간의 주(월요일 시작, 네이버 데이터랩 주 단위와 같은 기준)별
// 총 실행 수와 브랜드별 언급 수. range 창으로 자르지 않는다(검색 추이와 같은 기간을 겹쳐 봐야 하므로).
export interface BrandMentionWeek {
  /** 주 시작일(월요일, yyyy-mm-dd). */
  weekStart: string;
  runs: number;
  mentions: Record<string, number>;
}

export async function getRealBrandMentionWeeks(filters: RealDataFilters = {}): Promise<BrandMentionWeek[] | null> {
  const result = await getProcessedWithWeeks("4w", filters);
  if (!result) return null;
  const { processed, weekOfRun, brands } = result;

  // 수집 주(일요일 시작) → 월요일 시작으로 하루 민다.
  const toMonday = (sunday: string) => {
    const d = new Date(`${sunday}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, BrandMentionWeek>();
  const weekFor = (runId: string) => {
    const sunday = weekOfRun.get(runId);
    if (!sunday) return null;
    const key = toMonday(sunday);
    if (!weeks.has(key)) weeks.set(key, { weekStart: key, runs: 0, mentions: {} });
    return weeks.get(key)!;
  };
  for (const runId of weekOfRun.keys()) {
    const week = weekFor(runId);
    if (week) week.runs += 1;
  }
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const brand = brandNameById.get(mention.brandId);
    const week = weekFor(mention.promptRunId);
    if (brand && week) week.mentions[brand] = (week.mentions[brand] ?? 0) + 1;
  }
  return [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// "프롬프트 지표" — 주별 총 실행 수 vs 우리 브랜드가 실제로 언급된 실행 수.
export async function getRealPromptMetricsByWeek(
  range: DateRange,
  filters: RealDataFilters = {}
): Promise<PromptMetricsPoint[] | null> {
  const { ownBrandId: OWN_BRAND_ID } = await currentScope();
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks } = result;
  const currentWeekSet = new Set(currentWeeks);

  const totalByWeek = new Map(currentWeeks.map((w) => [w, new Set<string>()]));
  const detectedByWeek = new Map(currentWeeks.map((w) => [w, new Set<string>()]));

  for (const [runId, week] of weekOfRun) {
    if (!currentWeekSet.has(week)) continue;
    totalByWeek.get(week)?.add(runId);
  }
  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    detectedByWeek.get(week)?.add(mention.promptRunId);
  }

  return currentWeeks.map((w) => ({
    week: formatWeekLabel(w),
    totalPrompts: totalByWeek.get(w)?.size ?? 0,
    sentimentDetectedPrompts: detectedByWeek.get(w)?.size ?? 0,
  }));
}

function dominantSentiment(sentiments: Sentiment[]): Sentiment {
  if (sentiments.length === 0) return "neutral";
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const s of sentiments) counts[s] += 1;
  return (Object.entries(counts) as [Sentiment, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

// "데이터 인사이트" — (수집 키워드, 모델) 조합별로 그룹화한 실측 지표. 주
// 단위가 아니라 getRealTopicRows와 같은 전체 기간 집계 — 이 테이블 자체가
// range 필터를 안 받는다.
export async function getRealDataInsights(filters: RealDataFilters = {}): Promise<DataInsightRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) });
  const runsById = new Map(promptRuns.map((r) => [r.id, r]));

  const ownMentionByRun = new Map<string, { present: boolean; sentiment: Sentiment }>();
  for (const m of processed.mentions) {
    if (m.brandId === OWN_BRAND_ID) ownMentionByRun.set(m.promptRunId, { present: m.isPresent, sentiment: m.sentiment });
  }
  const citationCountByRun = new Map<string, number>();
  const ownCitationCountByRun = new Map<string, number>();
  for (const c of processed.citations) {
    citationCountByRun.set(c.promptRunId, (citationCountByRun.get(c.promptRunId) ?? 0) + 1);
    if (c.isOwnDomain) ownCitationCountByRun.set(c.promptRunId, (ownCitationCountByRun.get(c.promptRunId) ?? 0) + 1);
  }

  const groups = new Map<string, string[]>();
  for (const run of promptRuns) {
    const query = run.rawMetadata.query?.trim();
    if (!query) continue;
    const key = `${query}__${run.llmModelId}`;
    const list = groups.get(key) ?? [];
    list.push(run.id);
    groups.set(key, list);
  }
  if (groups.size === 0) return null;

  const rows: DataInsightRow[] = Array.from(groups.entries()).map(([key, runIds]) => {
    const query = key.slice(0, key.lastIndexOf("__"));
    const modelId = runsById.get(runIds[0])!.llmModelId;
    const modelName = seedLlmModels.find((m) => m.id === modelId)?.name ?? modelId;
    const mentionedRuns = runIds.filter((id) => ownMentionByRun.get(id)?.present);
    const totalCitations = runIds.reduce((s, id) => s + (citationCountByRun.get(id) ?? 0), 0);
    const ownCitations = runIds.reduce((s, id) => s + (ownCitationCountByRun.get(id) ?? 0), 0);

    return {
      id: `real-insight-${key}`,
      topic: query,
      source: modelName,
      popularity: runIds.length,
      visibilityScore: Math.round((mentionedRuns.length / runIds.length) * 100),
      mentions: mentionedRuns.length,
      sentiment: dominantSentiment(mentionedRuns.map((id) => ownMentionByRun.get(id)!.sentiment)),
      totalCitations,
      ownCitations,
    };
  });

  // 실행 횟수(popularity)가 아니라 가시성을 표본 크기까지 반영해 정렬한다.
  rows.sort(
    (a, b) =>
      wilsonLowerBound(b.mentions, b.popularity) - wilsonLowerBound(a.mentions, a.popularity) || b.popularity - a.popularity
  );
  return rows;
}

// "쉐어 오브 보이스" — 수집 키워드(토픽)별로 전 브랜드 언급을 모아 우리
// 브랜드의 순위·점유율을 계산. 전체 기간 집계(getRealDataInsights와 동일
// 이유로 range 없음).
export async function getRealShareOfVoice(filters: RealDataFilters = {}): Promise<ShareOfVoiceRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const brands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands });
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
  const ownBrandName = brandNameById.get(OWN_BRAND_ID);

  const queryOfRun = new Map<string, string>();
  for (const run of promptRuns) {
    const q = run.rawMetadata.query?.trim();
    if (q) queryOfRun.set(run.id, q);
  }

  const byTopic = new Map<string, Map<string, number>>();
  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const topic = queryOfRun.get(mention.promptRunId);
    if (!topic) continue;
    const brandMap = byTopic.get(topic) ?? new Map<string, number>();
    brandMap.set(mention.brandId, (brandMap.get(mention.brandId) ?? 0) + 1);
    byTopic.set(topic, brandMap);
  }
  if (byTopic.size === 0) return null;

  const rows: ShareOfVoiceRow[] = Array.from(byTopic.entries()).map(([topic, brandMap]) => {
    const total = Array.from(brandMap.values()).reduce((s, v) => s + v, 0);
    const sorted = Array.from(brandMap.entries())
      .map(([brandId, mentions]) => ({
        brand: brandNameById.get(brandId) ?? brandId,
        mentions,
        share: total > 0 ? Math.round((mentions / total) * 100) : 0,
      }))
      .sort((a, b) => b.mentions - a.mentions);
    const ownIndex = sorted.findIndex((b) => b.brand === ownBrandName);

    return {
      id: `real-sov-${topic}`,
      topic,
      popularity: total,
      mentions: ownIndex >= 0 ? sorted[ownIndex].mentions : 0,
      rank: ownIndex >= 0 ? ownIndex + 1 : sorted.length + 1,
      sharePercent: ownIndex >= 0 ? sorted[ownIndex].share : 0,
      topBrands: sorted.slice(0, 5).map(({ brand, share }) => ({ brand, share })),
    };
  });

  // 점유율(자사 언급 / 그 토픽의 전체 브랜드 언급)을 표본 크기까지 반영해 정렬 —
  // 언급 합계(popularity)로 정렬하면 언급이 많이 쌓인 토픽이 점유율과 무관하게 위로 온다.
  rows.sort(
    (a, b) =>
      wilsonLowerBound(b.mentions, b.popularity) - wilsonLowerBound(a.mentions, a.popularity) || b.popularity - a.popularity
  );
  return rows;
}

// 엔진(모델) × 질의 가시성 표 — 어느 엔진에서 어느 질의가 약한지 한눈에 보게 한다.
// 전체 기간 집계(토픽 표와 같은 이유로 range 없음). 행은 많이 실행한 질의 순 상위 N개.
export async function getRealModelTopicMatrix(maxRows = 15): Promise<ModelTopicMatrix | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  const promptRuns = runFiles.map((f) => f.promptRun).filter((run) => run.status === "success");
  if (promptRuns.length === 0) return null;

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) });
  const mentionedRuns = new Set(processed.mentions.filter((m) => m.brandId === OWN_BRAND_ID && m.isPresent).map((m) => m.promptRunId));

  const modelName = (id: string) => seedLlmModels.find((m) => m.id === id)?.name ?? id;
  const byQuery = new Map<string, Map<string, { hit: number; total: number }>>();
  const modelTotals = new Map<string, number>();
  for (const run of promptRuns) {
    const query = run.rawMetadata.query?.trim();
    if (!query) continue;
    const model = modelName(run.llmModelId);
    const cells = byQuery.get(query) ?? new Map<string, { hit: number; total: number }>();
    const cell = cells.get(model) ?? { hit: 0, total: 0 };
    cell.total += 1;
    if (mentionedRuns.has(run.id)) cell.hit += 1;
    cells.set(model, cell);
    byQuery.set(query, cells);
    modelTotals.set(model, (modelTotals.get(model) ?? 0) + 1);
  }
  if (byQuery.size === 0) return null;

  const models = [...modelTotals.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);
  const rows = [...byQuery.entries()]
    .map(([topic, cells]) => ({
      topic,
      totalRuns: [...cells.values()].reduce((sum, c) => sum + c.total, 0),
      cells: Object.fromEntries(cells),
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns)
    .slice(0, maxRows);
  return { models, rows };
}

// 엔진별 수집 품질 — 성공/AI 미답변/수집 실패. 가시성 비율의 분모(AI가 답한 실행)가
// 엔진마다 얼마나 다른지 보여줘, 엔진 간 비교의 신뢰도를 판단하게 한다.
export async function getRealCollectionQuality(): Promise<CollectionQualityRow[] | null> {
  const { orgId: ORG_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const byModel = new Map<string, CollectionQualityRow>();
  for (const { promptRun: run } of runFiles) {
    const model = seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId;
    const row = byModel.get(model) ?? { model, attempted: 0, answered: 0, absent: 0, error: 0 };
    row.attempted += 1;
    const outcome = getRunOutcome(run);
    if (outcome === "ai-answered") row.answered += 1;
    else if (outcome === "ai-absent") row.absent += 1;
    else row.error += 1;
    byModel.set(model, row);
  }
  return [...byModel.values()].sort((a, b) => b.attempted - a.attempted);
}

const SENTIMENT_RANK: Record<Sentiment, number> = { negative: 0, neutral: 1, positive: 2 };

// "개선/하락 상위 항목" — 같은 (수집 키워드, 모델) 조합을 여러 주에 걸쳐
// 반복 수집했을 때만 계산할 수 있다. 지금 당장은 대부분의 조합이 한 주
// 안에서만 수집돼서 비교할 두 번째 시점이 없으니 null(→ mock 폴백)이
// 나오는 게 정상 — 같은 키워드로 수집을 몇 주 더 반복하면 이 함수가
// 자동으로 실 데이터를 채운다. 별도 배포/코드 변경 필요 없음.
export async function getRealSentimentMovers(
  range: DateRange,
  filters: RealDataFilters = {}
): Promise<{ topMovers: SentimentMoverRow[]; bottomMovers: SentimentMoverRow[] } | null> {
  const { ownBrandId: OWN_BRAND_ID } = await currentScope();
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, runsById } = result;
  const currentWeekSet = new Set(currentWeeks);

  const groups = new Map<string, { runId: string; week: string; sentiment: Sentiment }[]>();
  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const run = runsById.get(mention.promptRunId);
    const query = run?.rawMetadata.query?.trim();
    if (!run || !query) continue;
    const key = `${query}__${run.llmModelId}`;
    const list = groups.get(key) ?? [];
    list.push({ runId: run.id, week, sentiment: mention.sentiment });
    groups.set(key, list);
  }

  const topMovers: SentimentMoverRow[] = [];
  const bottomMovers: SentimentMoverRow[] = [];

  for (const [key, runPoints] of groups) {
    // 같은 주의 실행끼리는 추세가 아니라 표본 — 주별 우세 감성으로 묶고 서로 다른
    // 두 주 이상이 있어야 비교한다(실행 1건의 우연한 변동이 개선/하락으로 잡히지 않게).
    const byWeek = new Map<string, { runId: string; sentiments: Sentiment[] }>();
    for (const p of runPoints) {
      const cur = byWeek.get(p.week) ?? { runId: p.runId, sentiments: [] };
      cur.sentiments.push(p.sentiment);
      byWeek.set(p.week, cur);
    }
    if (byWeek.size < 2) continue; // 비교할 두 번째 시점이 아직 없음
    const points = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ runId: v.runId, week, sentiment: dominantSentiment(v.sentiments) }));
    const first = points[0];
    const last = points[points.length - 1];
    if (first.sentiment === last.sentiment) continue;

    const query = key.slice(0, key.lastIndexOf("__"));
    const run = runsById.get(last.runId)!;
    const modelName = seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId;

    const row: SentimentMoverRow = {
      id: `real-mover-${key}`,
      prompt: query,
      source: modelName,
      topic: query,
      category: run.rawMetadata.category ?? "—",
      market: seedMarkets.find((m) => m.id === run.marketId)?.label ?? run.marketId,
      popularity: points.length,
      fromSentiment: first.sentiment,
      toSentiment: last.sentiment,
    };

    if (SENTIMENT_RANK[last.sentiment] > SENTIMENT_RANK[first.sentiment]) topMovers.push(row);
    else bottomMovers.push(row);
  }

  if (topMovers.length === 0 && bottomMovers.length === 0) return null;

  topMovers.sort((a, b) => b.popularity - a.popularity);
  bottomMovers.sort((a, b) => b.popularity - a.popularity);
  return { topMovers, bottomMovers };
}

// URL 인스펙터 — 수집된 실행들의 인용(citations)을 URL/도메인 단위로
// 집계한다. "콘텐츠 가시성"(사이트맵 크롤과 별도로 매칭해야 함)과
// "카테고리"/"콘텐츠 유형"(분류할 실 소스가 없음)은 계산할 수 없어 각각
// null/"미분류"로 남긴다 — 나머지(인용 횟수, 인용된 프롬프트 수, 마켓)는
// 전부 실측치다.
export async function getRealUrlInspectorData(filters: RealDataFilters = {}): Promise<UrlInspectorData | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) });
  if (processed.citations.length === 0) return null;

  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const marketOf = (runId: string) => {
    const run = runsById.get(runId);
    return seedMarkets.find((m) => m.id === run?.marketId)?.code ?? "GLOBAL";
  };
  const queryOf = (runId: string) => runsById.get(runId)?.rawMetadata.query?.trim();
  const promptTitlesOf = (runIds: Set<string>) => [...new Set([...runIds].map(queryOf).filter((q): q is string => !!q))];
  const citedRunsOf = (runIds: Set<string>): CitedPromptRun[] =>
    [...runIds]
      .flatMap((runId) => {
        const run = runsById.get(runId);
        const prompt = queryOf(runId);
        if (!run || !prompt) return [];
        return [{ prompt, runAt: run.runAt, model: seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId, market: marketOf(runId) }];
      })
      .sort((a, b) => b.runAt.localeCompare(a.runAt));

  interface UrlAgg {
    isOwnDomain: boolean;
    domain: string;
    title: string;
    citations: number;
    promptRunIds: Set<string>;
    markets: Map<string, number>;
  }
  const byUrl = new Map<string, UrlAgg>();
  for (const c of processed.citations) {
    const agg = byUrl.get(c.pageUrl) ?? {
      isOwnDomain: c.isOwnDomain,
      domain: c.domain,
      title: c.title,
      citations: 0,
      promptRunIds: new Set<string>(),
      markets: new Map<string, number>(),
    };
    agg.citations += 1;
    agg.promptRunIds.add(c.promptRunId);
    const market = marketOf(c.promptRunId);
    agg.markets.set(market, (agg.markets.get(market) ?? 0) + 1);
    byUrl.set(c.pageUrl, agg);
  }

  function topMarket(agg: UrlAgg) {
    return [...agg.markets.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const ownUrls: OwnCitedUrlRow[] = [];
  const thirdPartyUrls: ThirdPartyUrlRow[] = [];
  let i = 0;
  for (const [url, agg] of byUrl) {
    if (agg.isOwnDomain) {
      ownUrls.push({
        id: `real-own-${i++}`,
        url,
        citations: agg.citations,
        citedPrompts: agg.promptRunIds.size,
        citedPromptTitles: promptTitlesOf(agg.promptRunIds),
        citedPromptRuns: citedRunsOf(agg.promptRunIds),
        contentVisibility: null,
        category: "미분류",
        market: topMarket(agg),
      });
    } else {
      thirdPartyUrls.push({
        id: `real-tp-${i++}`,
        url,
        contentType: "미분류",
        citations: agg.citations,
        citedPrompts: agg.promptRunIds.size,
        citedPromptTitles: promptTitlesOf(agg.promptRunIds),
        citedPromptRuns: citedRunsOf(agg.promptRunIds),
        category: "미분류",
        market: topMarket(agg),
      });
    }
  }
  ownUrls.sort((a, b) => b.citations - a.citations);
  thirdPartyUrls.sort((a, b) => b.citations - a.citations);

  interface DomainAgg {
    citations: number;
    urls: Set<string>;
    promptRunIds: Set<string>;
    isOwnDomain: boolean;
  }
  const byDomain = new Map<string, DomainAgg>();
  for (const c of processed.citations) {
    const agg = byDomain.get(c.domain) ?? { citations: 0, urls: new Set<string>(), promptRunIds: new Set<string>(), isOwnDomain: c.isOwnDomain };
    agg.citations += 1;
    agg.urls.add(c.pageUrl);
    agg.promptRunIds.add(c.promptRunId);
    byDomain.set(c.domain, agg);
  }
  const citedDomains: CitedDomainRow[] = [...byDomain.entries()]
    .map(([domain, agg], idx) => ({
      id: `real-domain-${idx}`,
      domain,
      citations: agg.citations,
      uniqueUrls: agg.urls.size,
      citationsPerUrl: Number((agg.citations / agg.urls.size).toFixed(1)),
      citedPrompts: agg.promptRunIds.size,
      contentType: agg.isOwnDomain ? "자사" : "미분류",
    }))
    .sort((a, b) => b.citedPrompts - a.citedPrompts || b.citations - a.citations);

  const distinctPromptRunIds = new Set(processed.citations.map((c) => c.promptRunId));
  const ownPromptRunIds = new Set(processed.citations.filter((c) => c.isOwnDomain).map((c) => c.promptRunId));

  return {
    ownCitedPrompts: ownPromptRunIds.size,
    totalCitedPrompts: distinctPromptRunIds.size,
    uniqueCitedUrls: byUrl.size,
    totalCitations: processed.citations.length,
    ownUrls,
    thirdPartyUrls,
    citedDomains,
  };
}

// 가시성 개요의 "최신 상위 브랜드" — 브랜드가 언급된 "답변 수" 기준 랭킹(mentions).
//  · 한 답변에서 여러 번 나와도 1로 센다 — 출현 횟수는 답변이 길수록 부풀어서 순위를 왜곡하고,
//    다른 화면의 언급 집계(실행 단위)와도 기준이 어긋난다. 출현 횟수는 occurrences로 따로 두고 동률 정렬에만 쓴다.
//  · 별칭이 겹쳐도(예: "Adobe"와 "Adobe Marketo Engage") 같은 자리를 두 번 세지 않는다.
//  · includeOwn=true면 자사도 순위에 넣고 isOwn으로 표시한다. 기본(false)은 "추적할 브랜드 추천"처럼
//    자사를 빼야 하는 호출(브랜드 상세)을 위한 것이다.
export async function getRealTopBrands(
  filters: RealDataFilters & { range?: DateRange; includeOwn?: boolean } = {}
): Promise<BrandRankRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const filteredRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  const weeks = [...new Set(filteredRuns.map((run) => toUtcSundayWeekStart(run.runAt)))].sort();
  const currentWeeks = filters.range ? weeks.slice(-RANGE_WEEKS[filters.range]) : weeks;
  const currentWeekSet = new Set(currentWeeks);
  const promptRuns = filteredRuns.filter((run) => !filters.range || currentWeekSet.has(toUtcSundayWeekStart(run.runAt)));
  if (promptRuns.length === 0) return null;

  const brands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands });

  const knownBrandNames = new Set(
    brands.flatMap((brand) => [brand.name, brand.domain, ...brand.aliases].filter(Boolean)).map((name) => name.toLocaleLowerCase("ko-KR"))
  );
  const mentionsByBrand = new Map<string, { answers: number; occurrences: number; sampleContext?: string }>();
  for (const brand of brands) {
    // 긴 패턴부터 한 번에 매칭해서 겹치는 별칭이 같은 자리를 두 번 세지 않게 한다.
    const patterns = [...new Set(brandPatterns(brand).map((pattern) => pattern.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    if (patterns.length === 0) continue;
    const regex = new RegExp(patterns.map(escapeRegex).join("|"), "gi");
    for (const run of promptRuns) {
      const matches = [...run.rawResponse.matchAll(regex)];
      if (matches.length === 0) continue;
      const current = mentionsByBrand.get(brand.id);
      mentionsByBrand.set(brand.id, {
        answers: (current?.answers ?? 0) + 1,
        occurrences: (current?.occurrences ?? 0) + matches.length,
        sampleContext: current?.sampleContext ?? contextAround(run.rawResponse, matches[0].index ?? 0, matches[0][0].length),
      });
    }
  }

  const trackedRows: BrandRankRow[] = [...mentionsByBrand.entries()]
    .filter(([brandId]) => filters.includeOwn || brandId !== OWN_BRAND_ID)
    .map(([brandId, agg]) => ({
      id: `real-brand-${brandId}`,
      brand: brands.find((b) => b.id === brandId)?.name ?? brandId,
      mentions: agg.answers,
      totalAnswers: promptRuns.length,
      occurrences: agg.occurrences,
      source: "tracked" as const,
      isOwn: brandId === OWN_BRAND_ID || undefined,
      sampleContext: agg.sampleContext,
    }));

  const detectedByName = new Map<string, BrandRankRow>();
  const citationDomainsByRun = new Map<string, string[]>();
  for (const citation of processed.citations) {
    const domains = citationDomainsByRun.get(citation.promptRunId) ?? [];
    domains.push(citation.domain);
    citationDomainsByRun.set(citation.promptRunId, domains);
  }
  for (const run of promptRuns) {
    for (const candidate of detectCompanyCandidates(run.rawResponse, knownBrandNames, citationDomainsByRun.get(run.id) ?? [])) {
      const key = candidate.name.toLocaleLowerCase("ko-KR");
      const current = detectedByName.get(key);
      detectedByName.set(key, {
        id: `detected-brand-${key.replace(/[^a-z0-9가-힣]+/gi, "-")}`,
        brand: current?.brand ?? candidate.name,
        mentions: (current?.mentions ?? 0) + 1,
        totalAnswers: promptRuns.length,
        occurrences: (current?.occurrences ?? 0) + candidate.count,
        source: "detected",
        sampleContext: current?.sampleContext ?? candidate.sampleContext,
        evidenceDomain: current?.evidenceDomain ?? candidate.evidenceDomain,
      });
    }
  }
  // 정규식으로 찾은 후보는 한 답변에서만 나온 우연(직책·일반어)이 많아 2개 답변 이상에서 나온 것만 보인다.
  // 기준을 고정값(2)으로 두면 수집이 늘수록 우연히 통과하는 후보가 늘어 목록이 길어진다 —
  // 전체 답변 수에 비례해 올리되 최소 2개 답변은 유지한다.
  const minDetectedAnswers = Math.max(MIN_DETECTED_ANSWERS, Math.ceil(promptRuns.length * DETECTED_ANSWERS_SHARE));
  const detectedRows = [...detectedByName.values()].filter((row) => row.mentions >= minDetectedAnswers);

  const rows = [...trackedRows, ...detectedRows].sort(
    (a, b) => b.mentions - a.mentions || (b.occurrences ?? 0) - (a.occurrences ?? 0) || a.brand.localeCompare(b.brand, "ko-KR")
  );
  return rows.length > 0 ? rows : null;
}

// 브랜드 역할 분류(브랜드 최적화)의 근거 — 이름별로 "몇 개 답변에서 언급됐고, 그중 자사도 함께 나온 답변은 몇 개인지",
// 그리고 답변이 그 브랜드를 소개한 대목. AI에게 판단을 맡기되 근거 숫자는 우리가 센다.
// 등록된 브랜드는 별칭까지 함께 찾고, 후보는 이름 그대로 찾는다. 긴 표기부터 한 번에 매칭해 겹치는 별칭을 두 번 세지 않는다.
export async function getRealBrandEvidence(names: string[]): Promise<Record<string, BrandEvidence>> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runs = (await listCollectedRuns(ORG_ID)).map((f) => f.promptRun).filter((run) => run.status === "success");
  if (runs.length === 0 || names.length === 0) return {};

  const brands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const own = brands.find((b) => b.id === OWN_BRAND_ID);
  const compile = (patterns: string[]) => {
    const list = [...new Set(patterns.map((p) => p.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
    return list.length ? new RegExp(list.map(escapeRegex).join("|"), "gi") : null;
  };
  const ownRegex = own ? compile(brandPatterns(own)) : null;
  const registered = new Map(brands.filter((b) => !b.isOwnBrand).map((b) => [nameKey(b.name), b]));

  const result: Record<string, BrandEvidence> = {};
  for (const name of names) {
    const key = nameKey(name);
    const seed = registered.get(key);
    const regex = compile(seed ? brandPatterns(seed) : [name]);
    if (!regex) continue;
    let answers = 0;
    let withOwn = 0;
    let snippet: string | undefined;
    let snippetWithOwn = false;
    for (const run of runs) {
      const match = run.rawResponse.match(regex);
      if (!match) continue;
      answers += 1;
      const alsoOwn = !!ownRegex && new RegExp(ownRegex.source, "i").test(run.rawResponse);
      if (alsoOwn) withOwn += 1;
      // 소개 대목은 자사와 함께 나온 답변을 우선한다 — 같은 목록 안에서 어떤 역할로 소개되는지가 보이므로.
      if (!snippet || (alsoOwn && !snippetWithOwn)) {
        const at = run.rawResponse.search(new RegExp(regex.source, "i"));
        snippet = run.rawResponse.slice(Math.max(0, at - 30), at + match[0].length + 110).replace(/\s+/g, " ").trim();
        snippetWithOwn = alsoOwn;
      }
    }
    if (answers > 0) result[key] = { answers, withOwn, snippet };
  }
  return result;
}

// 가시성 개요의 "인용된 페이지" — 자사 도메인 URL별로 응답 수(그 URL을
// 인용한 서로 다른 실행 수)와, 그 응답들 중 우리 브랜드가 함께 언급된
// 실행 수(myBrand)를 집계한다.
export async function getRealCitedPages(filters: RealDataFilters = {}): Promise<CitedPageRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) });
  const ownCitations = processed.citations.filter((c) => c.isOwnDomain);
  if (ownCitations.length === 0) return null;

  const ownMentionRuns = new Set(processed.mentions.filter((m) => m.brandId === OWN_BRAND_ID && m.isPresent).map((m) => m.promptRunId));
  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const marketOf = (runId: string) => seedMarkets.find((m) => m.id === runsById.get(runId)?.marketId)?.code ?? "GLOBAL";

  const byUrl = new Map<string, { promptRunIds: Set<string>; markets: Map<string, number> }>();
  for (const c of ownCitations) {
    const agg = byUrl.get(c.pageUrl) ?? { promptRunIds: new Set<string>(), markets: new Map<string, number>() };
    agg.promptRunIds.add(c.promptRunId);
    const market = marketOf(c.promptRunId);
    agg.markets.set(market, (agg.markets.get(market) ?? 0) + 1);
    byUrl.set(c.pageUrl, agg);
  }

  return [...byUrl.entries()]
    .map(([pageUrl, agg], i) => ({
      id: `real-page-${i}`,
      pageUrl,
      responses: agg.promptRunIds.size,
      market: [...agg.markets.entries()].sort((a, b) => b[1] - a[1])[0][0],
      myBrand: String([...agg.promptRunIds].filter((id) => ownMentionRuns.has(id)).length),
    }))
    .sort((a, b) => b.responses - a.responses);
}

// 가시성 개요의 "인용된 소스"/"소스 기회" — 제3자(자사 제외) 도메인별
// 집계. myBrandMentions === 0인 도메인만 따로 뽑으면 "소스 기회"(경쟁
// 토픽에서 자주 인용되지만 아직 우리 브랜드는 안 잡히는 소스)가 된다.
//
// 브랜드 설정에서 등록한 "획득 콘텐츠 소스"(earnedContentSources)는 여기
// trackedDomains로 합쳐진다 — 그래야 등록/삭제가 실제로 이 표에 반영된다.
// 아직 한 번도 인용되지 않은 도메인이라도(인용 수 0으로) 목록에 나타나야
// "등록했더니 여기서 추적되기 시작했다"는 게 실제로 보인다. 이전엔
// earnedContentSources가 브랜드 상세 화면에만 표시되고 이 집계와 완전히
// 분리돼 있어 추가/삭제해도 아무 데도 반영되지 않았다.
export async function getRealCitedSources(
  filters: RealDataFilters = {},
  extras: { trackedDomains?: string[] } = {}
): Promise<CitedSourceRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const trackedDomains = extras.trackedDomains ?? [];
  const runFiles = await listCollectedRuns(ORG_ID);

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);

  const processed =
    promptRuns.length > 0
      ? await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) })
      : null;
  const thirdPartyCitations = processed?.citations.filter((c) => !c.isOwnDomain) ?? [];
  if (thirdPartyCitations.length === 0 && trackedDomains.length === 0) return null;

  const ownMentionRuns = new Set(
    processed?.mentions.filter((m) => m.brandId === OWN_BRAND_ID && m.isPresent).map((m) => m.promptRunId) ?? []
  );
  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const marketOf = (runId: string) => seedMarkets.find((m) => m.id === runsById.get(runId)?.marketId)?.code ?? "GLOBAL";

  // 답변(run)별로 언급된 경쟁사 이름 — 소스 도메인 행에 "함께 언급된 경쟁사"를 붙이는 근거.
  const competitorNames = new Map(
    (promptRuns.length > 0 ? await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID) : []).filter((b) => !b.isOwnBrand).map((b) => [b.id, b.name])
  );
  const competitorsByRun = new Map<string, string[]>();
  for (const m of processed?.mentions ?? []) {
    const name = m.isPresent ? competitorNames.get(m.brandId) : undefined;
    if (!name) continue;
    const list = competitorsByRun.get(m.promptRunId) ?? [];
    list.push(name);
    competitorsByRun.set(m.promptRunId, list);
  }

  const byDomain = new Map<string, { pageUrls: Set<string>; promptRunIds: Set<string>; markets: Map<string, number> }>();
  for (const c of thirdPartyCitations) {
    const agg = byDomain.get(c.domain) ?? { pageUrls: new Set<string>(), promptRunIds: new Set<string>(), markets: new Map<string, number>() };
    agg.pageUrls.add(c.pageUrl);
    agg.promptRunIds.add(c.promptRunId);
    const market = marketOf(c.promptRunId);
    agg.markets.set(market, (agg.markets.get(market) ?? 0) + 1);
    byDomain.set(c.domain, agg);
  }
  // 아직 인용이 없는 등록 도메인도 0건짜리 행으로 채워 넣는다.
  for (const domain of trackedDomains) {
    if (!byDomain.has(domain)) {
      byDomain.set(domain, { pageUrls: new Set<string>(), promptRunIds: new Set<string>(), markets: new Map<string, number>() });
    }
  }

  return [...byDomain.entries()]
    .map(([domain, agg], i) => ({
      id: `real-source-${i}`,
      domain,
      market: [...agg.markets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "GLOBAL",
      myBrandMentions: [...agg.promptRunIds].filter((id) => ownMentionRuns.has(id)).length,
      citedPages: agg.pageUrls.size,
      prompts: agg.promptRunIds.size,
      coMentionedCompetitors: (() => {
        const counts = new Map<string, number>();
        for (const runId of agg.promptRunIds) for (const name of competitorsByRun.get(runId) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([brand, answers]) => ({ brand, answers }));
      })(),
    }))
    .sort((a, b) => b.prompts - a.prompts);
}

export async function getRealSourceOpportunities(
  filters: RealDataFilters = {},
  extras: { trackedDomains?: string[] } = {}
): Promise<CitedSourceRow[] | null> {
  const sources = await getRealCitedSources(filters, extras);
  if (!sources) return null;
  const opportunities = sources.filter((s) => s.myBrandMentions === 0);
  return opportunities.length > 0 ? opportunities : null;
}

// ---- 프롬프트 전략 "LLM 브레인스토밍" 마법사용 실측 데이터 ----
// 토픽별로 브랜드마다 실제 언급 수를 집계한다 — LLM이 브랜드 언급 수 같은
// 숫자를 지어내지 않도록, 브레인스토밍 마법사 1단계 프롬프트에 이 실측
// 표를 그대로 넣어준다. 최종 저장 시에도 LLM이 인용한 토픽 문자열로 이
// 표를 다시 조회해 brandMentions를 채운다(LLM 응답의 숫자는 쓰지 않음).
export interface TopicBrandMentionRow {
  topic: string;
  market: string;
  brandMentions: StrategyBrandMention[];
}

export async function getRealTopicBrandMentions(filters: RealDataFilters = {}): Promise<TopicBrandMentionRow[] | null> {
  const { orgId: ORG_ID, ownBrandId: OWN_BRAND_ID } = await currentScope();
  const runFiles = await listCollectedRuns(ORG_ID);
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const brands = await getRealBrandSeeds(ORG_ID, OWN_BRAND_ID);
  const processed = await processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands });
  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const brandNameById = new Map(brands.map((b) => [b.id, b.name]));

  const runIdsByQuery = new Map<string, string[]>();
  for (const run of promptRuns) {
    const query = run.rawMetadata.query?.trim();
    if (!query) continue;
    const list = runIdsByQuery.get(query) ?? [];
    list.push(run.id);
    runIdsByQuery.set(query, list);
  }
  if (runIdsByQuery.size === 0) return null;

  const mentionsByRun = new Map<string, Set<string>>();
  for (const m of processed.mentions) {
    if (!m.isPresent) continue;
    const set = mentionsByRun.get(m.promptRunId) ?? new Set<string>();
    set.add(m.brandId);
    mentionsByRun.set(m.promptRunId, set);
  }

  return [...runIdsByQuery.entries()].map(([topic, runIds]) => {
    const market = seedMarkets.find((m) => m.id === runsById.get(runIds[0])?.marketId)?.label ?? "전체";
    const countByBrand = new Map<string, number>();
    for (const runId of runIds) {
      for (const brandId of mentionsByRun.get(runId) ?? []) {
        countByBrand.set(brandId, (countByBrand.get(brandId) ?? 0) + 1);
      }
    }
    const brandMentions: StrategyBrandMention[] = brands
      .map((b) => ({ brand: brandNameById.get(b.id) ?? b.id, mentions: countByBrand.get(b.id) ?? 0, isOwnBrand: b.id === OWN_BRAND_ID }))
      .filter((bm) => bm.mentions > 0 || bm.isOwnBrand);
    return { topic, market, brandMentions };
  });
}

// 위 실측 표를 LLM 프롬프트에 그대로 붙여넣을 텍스트로 포맷한다.
// 수집이 쌓일수록 토픽 수가 늘어나 프롬프트가 무한정 길어질 수 있으므로,
// "이야깃거리가 될 만한" 토픽(총 언급이 많거나 브랜드 간 격차가 큰 토픽)을
// 우선해 상위 N개만 넣는다.
const DIGEST_MAX_TOPICS = 40;

export function formatTopicBrandMentionsDigest(rows: TopicBrandMentionRow[]): string {
  const ranked = [...rows].sort((a, b) => {
    const totalA = a.brandMentions.reduce((sum, bm) => sum + bm.mentions, 0);
    const totalB = b.brandMentions.reduce((sum, bm) => sum + bm.mentions, 0);
    return totalB - totalA;
  });
  return ranked
    .slice(0, DIGEST_MAX_TOPICS)
    .map((r) => {
      const brandsText = r.brandMentions.map((bm) => `${bm.brand} ${bm.mentions}회${bm.isOwnBrand ? "(자사)" : ""}`).join(", ");
      return `- "${r.topic}" (마켓 ${r.market}): ${brandsText}`;
    })
    .join("\n");
}
