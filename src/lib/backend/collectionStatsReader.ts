import { listCollectedRuns } from "./collectionRuns";
import { processPromptRuns } from "./processing";
import { formatWeekLabel, toUtcSundayWeekStart } from "./processing/date";
import { seedBrands, seedLlmModels, seedMarkets } from "@/lib/db/data/seed";
import {
  BrandRankRow,
  BrandWeeklyPoint,
  CitedDomainRow,
  CitedPageRow,
  CitedSourceRow,
  DataInsightRow,
  DateRange,
  MarketComparisonRow,
  OwnCitedUrlRow,
  PromptMetricsPoint,
  RankedRow,
  Sentiment,
  SentimentMoverRow,
  SentimentWeek,
  ShareOfVoiceRow,
  StatCard,
  ThirdPartyUrlRow,
  TopicPromptRow,
  TopicRow,
  UrlInspectorData,
} from "@/lib/db/types";

// Server-only (pulls in collectionRuns.ts, which uses node:fs) — call only
// from a server component/route, never a "use client" file.
const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };
const OWN_BRAND_ID = "brand-neodigm";
const ORG_ID = "neodigm";

export interface RealMetric {
  value: number;
  trend: StatCard["trend"];
  sparkline: StatCard["sparkline"];
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

function average(values: number[]) {
  return values.length > 0 ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1)) : 0;
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
}

// Shared by every getReal* below — same processed mentions/citations
// bucketed by the run's week, just aggregated differently per caller.
// Returns null when nothing's been collected yet (or nothing survives the
// filter), so callers fall back to the seeded mock.
async function getProcessedWithWeeks(range: DateRange, filters: RealDataFilters = {}) {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });

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
  return { processed, weekOfRun, currentWeeks, previousWeeks, runsById };
}

// Same "우리 브랜드가 언급된 프롬프트 실행의 감성" the mentions pipeline
// already classifies per-run (see processing/mentions.ts) — just bucketed
// by week for the chart instead of by stat-card total. Returns null when
// nothing's been collected yet, so Overview falls back to the seeded chart.
export async function getRealSentimentSeries(range: DateRange, filters: RealDataFilters = {}): Promise<SentimentWeek[] | null> {
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

  return currentWeeks.map((w) => ({ week: formatWeekLabel(w), ...byWeek.get(w)! }));
}

// Mentions/citations already carry a brandId for every tracked brand, not
// just our own (see processing/mentions.ts + citations.ts), so market
// comparison is just the same real pipeline aggregated per brand instead
// of filtered to OWN_BRAND_ID. Returns null when nothing's been collected.
export async function getRealMarketComparison(range: DateRange, filters: RealDataFilters = {}): Promise<MarketComparisonRow[] | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks } = result;
  const currentWeekSet = new Set(currentWeeks);

  const byBrand = new Map<string, { brand: string; isSelf: boolean; mentions: number; citations: number }>();
  for (const brand of seedBrands) {
    byBrand.set(brand.id, { brand: brand.name, isSelf: brand.isOwnBrand, mentions: 0, citations: 0 });
  }

  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const row = byBrand.get(mention.brandId);
    if (row) row.mentions += 1;
  }

  for (const citation of processed.citations) {
    if (!citation.brandId) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const row = byBrand.get(citation.brandId);
    if (row) row.citations += 1;
  }

  return Array.from(byBrand.values())
    .filter((row) => row.mentions > 0 || row.citations > 0)
    .sort((a, b) => b.mentions + b.citations - (a.mentions + a.citations));
}

// Builds the same 3 real-data-backed metrics (visibility score, brand
// mentions, citations) the collection-runs page already computes on the
// fly from actual collected files — bucketed by week so Overview's range
// filter (1w/2w/4w) and trend-vs-previous-period behave the same as the
// mock snapshot path it replaces. Returns null when nothing's been
// collected yet, so the caller can fall back to the seeded snapshot cards.
export async function getRealStatSeries(range: DateRange, filters: RealDataFilters = {}): Promise<RealStatSeries | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, previousWeeks } = result;

  const allWeeks = Array.from(new Set([...currentWeeks, ...previousWeeks]));
  const mentionsByWeek = new Map(allWeeks.map((w) => [w, 0]));
  const citationsByWeek = new Map(allWeeks.map((w) => [w, 0]));
  const visibilityByWeek = new Map<string, number[]>(allWeeks.map((w) => [w, []]));

  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (week) mentionsByWeek.set(week, (mentionsByWeek.get(week) ?? 0) + 1);
  }

  for (const citation of processed.citations) {
    if (!citation.isOwnDomain) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (week) citationsByWeek.set(week, (citationsByWeek.get(week) ?? 0) + 1);
  }

  for (const score of processed.visibilityScores) {
    visibilityByWeek.get(score.weekStart)?.push(score.totalScore);
  }

  const sum = (list: string[], map: Map<string, number>) => list.reduce((s, w) => s + (map.get(w) ?? 0), 0);
  const sparkline = (list: string[], map: Map<string, number>) =>
    list.map((w) => ({ week: formatWeekLabel(w), value: map.get(w) ?? 0 }));

  const currentVis = average(currentWeeks.flatMap((w) => visibilityByWeek.get(w) ?? []));
  const previousVis = average(previousWeeks.flatMap((w) => visibilityByWeek.get(w) ?? []));
  const currentMentions = sum(currentWeeks, mentionsByWeek);
  const currentCitations = sum(currentWeeks, citationsByWeek);

  return {
    visibilityScore: {
      value: currentVis,
      trend: trend(currentVis, previousWeeks.length ? previousVis : undefined),
      sparkline: currentWeeks.map((w) => ({ week: formatWeekLabel(w), value: average(visibilityByWeek.get(w) ?? []) })),
    },
    brandMentions: {
      value: currentMentions,
      trend: trend(currentMentions, previousWeeks.length ? sum(previousWeeks, mentionsByWeek) : undefined),
      sparkline: sparkline(currentWeeks, mentionsByWeek),
    },
    citations: {
      value: currentCitations,
      trend: trend(currentCitations, previousWeeks.length ? sum(previousWeeks, citationsByWeek) : undefined),
      sparkline: sparkline(currentWeeks, citationsByWeek),
    },
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
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
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

  // targetUrl 인용 트래킹용 — 이 필터 범위 안의 전체 수집(이 토픽의 실행뿐
  // 아니라 전부) 기준으로 그 URL이 실제로 몇 번 인용됐는지 센다. "이
  // 콘텐츠가 AI 답변에 인용되는가"는 원래 프롬프트가 아니라 다른
  // 프롬프트에서도 인용될 수 있어서 전체 집합에서 세는 게 맞다.
  const citationCountByPageUrl = new Map<string, number>();
  for (const c of processed.citations) {
    citationCountByPageUrl.set(c.pageUrl, (citationCountByPageUrl.get(c.pageUrl) ?? 0) + 1);
  }
  const libraryPromptSet = new Set((extras.libraryPrompts ?? []).map((p) => p.trim().toLowerCase()));

  const topPrompts: TopicRow[] = [];
  const opportunities: TopicRow[] = [];

  for (const [query, runIds] of runIdsByQuery) {
    const mentionCount = runIds.filter((id) => ownMentionByRun.get(id)).length;
    const firstRun = runsById.get(runIds[0])!;
    const market = seedMarkets.find((m) => m.id === firstRun.marketId)?.label ?? firstRun.marketId;

    const prompts: TopicPromptRow[] = runIds
      .map((id) => {
        const run = runsById.get(id)!;
        return {
          id,
          prompt: query,
          model: seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId,
          myBrand: ownMentionByRun.get(id) ? "노출" : "미노출",
          brand: String(otherMentionCountByRun.get(id) ?? 0),
          source: String(citationCountByRun.get(id) ?? 0),
          market: seedMarkets.find((m) => m.id === run.marketId)?.label ?? run.marketId,
          runAt: run.runAt,
        };
      })
      .sort((a, b) => (a.runAt ?? "").localeCompare(b.runAt ?? ""));

    const targetUrl = extras.targetUrls?.[query];

    const row: TopicRow = {
      id: `real-${query}`,
      topic: query,
      mentions: mentionCount,
      visibility: Math.round((mentionCount / runIds.length) * 100),
      market,
      prompts,
      addedToLibrary: libraryPromptSet.size > 0 ? libraryPromptSet.has(query.trim().toLowerCase()) : undefined,
      targetUrl,
      targetUrlCitations: targetUrl ? (citationCountByPageUrl.get(targetUrl) ?? 0) : undefined,
      createdAt: prompts[0]?.runAt,
    };

    (mentionCount > 0 ? topPrompts : opportunities).push(row);
  }

  topPrompts.sort((a, b) => b.mentions - a.mentions);
  opportunities.sort((a, b) => b.prompts.length - a.prompts.length);

  if (topPrompts.length === 0 && opportunities.length === 0) return null;
  return { topPrompts, opportunities };
}

// ---- Brand Presence page ----

// 주간×브랜드별 언급/인용 수 — "마켓 트래킹" 차트가 필요로 하는 shape
// (BrandWeeklyPoint: { week, [brand]: number, ... }). getRealMarketComparison
// 은 기간 전체를 한 번에 합산하는데, 이건 그걸 주 단위로 쪼갠 버전.
export async function getRealMarketWeeklyTracking(
  range: DateRange,
  filters: RealDataFilters = {}
): Promise<{ mentionsByWeek: BrandWeeklyPoint[]; citationsByWeek: BrandWeeklyPoint[] } | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks } = result;
  const currentWeekSet = new Set(currentWeeks);

  const brandNameById = new Map(seedBrands.map((b) => [b.id, b.name]));
  const mentionsByWeek = new Map<string, Map<string, number>>(currentWeeks.map((w) => [w, new Map()]));
  const citationsByWeek = new Map<string, Map<string, number>>(currentWeeks.map((w) => [w, new Map()]));

  for (const mention of processed.mentions) {
    if (!mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const brand = brandNameById.get(mention.brandId);
    if (!brand) continue;
    const map = mentionsByWeek.get(week)!;
    map.set(brand, (map.get(brand) ?? 0) + 1);
  }
  for (const citation of processed.citations) {
    if (!citation.brandId) continue;
    const week = weekOfRun.get(citation.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const brand = brandNameById.get(citation.brandId);
    if (!brand) continue;
    const map = citationsByWeek.get(week)!;
    map.set(brand, (map.get(brand) ?? 0) + 1);
  }

  const toPoints = (byWeek: Map<string, Map<string, number>>): BrandWeeklyPoint[] =>
    currentWeeks.map((w) => {
      const point: BrandWeeklyPoint = { week: formatWeekLabel(w) };
      for (const [brand, count] of byWeek.get(w) ?? []) point[brand] = count;
      return point;
    });

  const mentions = toPoints(mentionsByWeek);
  const citations = toPoints(citationsByWeek);
  const hasAny = mentions.some((p) => Object.keys(p).length > 1) || citations.some((p) => Object.keys(p).length > 1);
  if (!hasAny) return null;
  return { mentionsByWeek: mentions, citationsByWeek: citations };
}

// "프롬프트 지표" — 주별 총 실행 수 vs 우리 브랜드가 실제로 언급된 실행 수.
export async function getRealPromptMetricsByWeek(
  range: DateRange,
  filters: RealDataFilters = {}
): Promise<PromptMetricsPoint[] | null> {
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
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
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

  rows.sort((a, b) => b.popularity - a.popularity);
  return rows;
}

// "쉐어 오브 보이스" — 수집 키워드(토픽)별로 전 브랜드 언급을 모아 우리
// 브랜드의 순위·점유율을 계산. 전체 기간 집계(getRealDataInsights와 동일
// 이유로 range 없음).
export async function getRealShareOfVoice(filters: RealDataFilters = {}): Promise<ShareOfVoiceRow[] | null> {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
  const brandNameById = new Map(seedBrands.map((b) => [b.id, b.name]));
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

  rows.sort((a, b) => b.popularity - a.popularity);
  return rows;
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

  for (const [key, points] of groups) {
    if (points.length < 2) continue; // 비교할 두 번째 시점이 아직 없음
    points.sort((a, b) => a.week.localeCompare(b.week));
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
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
  if (processed.citations.length === 0) return null;

  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const marketOf = (runId: string) => {
    const run = runsById.get(runId);
    return seedMarkets.find((m) => m.id === run?.marketId)?.code ?? "GLOBAL";
  };

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
    .sort((a, b) => b.citations - a.citations);

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

// 가시성 개요의 "최신 상위 브랜드" — 전체 기간 언급 수 기준 브랜드 랭킹.
// 우리 브랜드도 포함해서 실제 언급 순위 그대로 보여준다 (share-of-voice와
// 달리 여기는 순위표라 자사 제외 안 함).
export async function getRealTopBrands(filters: RealDataFilters = {}): Promise<BrandRankRow[] | null> {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
  if (processed.mentions.length === 0) return null;

  const mentionsByBrand = new Map<string, number>();
  for (const m of processed.mentions) {
    if (!m.isPresent) continue;
    mentionsByBrand.set(m.brandId, (mentionsByBrand.get(m.brandId) ?? 0) + 1);
  }
  if (mentionsByBrand.size === 0) return null;

  return [...mentionsByBrand.entries()]
    .map(([brandId, mentions]) => ({
      id: `real-brand-${brandId}`,
      brand: seedBrands.find((b) => b.id === brandId)?.name ?? brandId,
      mentions,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

// 가시성 개요의 "인용된 페이지" — 자사 도메인 URL별로 응답 수(그 URL을
// 인용한 서로 다른 실행 수)와, 그 응답들 중 우리 브랜드가 함께 언급된
// 실행 수(myBrand)를 집계한다.
export async function getRealCitedPages(filters: RealDataFilters = {}): Promise<CitedPageRow[] | null> {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
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
export async function getRealCitedSources(filters: RealDataFilters = {}): Promise<CitedSourceRow[] | null> {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles
    .map((f) => f.promptRun)
    .filter((run) => run.status === "success")
    .filter((run) => !filters.llmModelId || run.llmModelId === filters.llmModelId)
    .filter((run) => !filters.category || run.rawMetadata.category === filters.category)
    .filter((run) => !filters.marketId || run.marketId === filters.marketId);
  if (promptRuns.length === 0) return null;

  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });
  const thirdPartyCitations = processed.citations.filter((c) => !c.isOwnDomain);
  if (thirdPartyCitations.length === 0) return null;

  const ownMentionRuns = new Set(processed.mentions.filter((m) => m.brandId === OWN_BRAND_ID && m.isPresent).map((m) => m.promptRunId));
  const runsById = new Map(promptRuns.map((r) => [r.id, r]));
  const marketOf = (runId: string) => seedMarkets.find((m) => m.id === runsById.get(runId)?.marketId)?.code ?? "GLOBAL";

  const byDomain = new Map<string, { pageUrls: Set<string>; promptRunIds: Set<string>; markets: Map<string, number> }>();
  for (const c of thirdPartyCitations) {
    const agg = byDomain.get(c.domain) ?? { pageUrls: new Set<string>(), promptRunIds: new Set<string>(), markets: new Map<string, number>() };
    agg.pageUrls.add(c.pageUrl);
    agg.promptRunIds.add(c.promptRunId);
    const market = marketOf(c.promptRunId);
    agg.markets.set(market, (agg.markets.get(market) ?? 0) + 1);
    byDomain.set(c.domain, agg);
  }

  return [...byDomain.entries()]
    .map(([domain, agg], i) => ({
      id: `real-source-${i}`,
      domain,
      market: [...agg.markets.entries()].sort((a, b) => b[1] - a[1])[0][0],
      myBrandMentions: [...agg.promptRunIds].filter((id) => ownMentionRuns.has(id)).length,
      citedPages: agg.pageUrls.size,
      prompts: agg.promptRunIds.size,
    }))
    .sort((a, b) => b.prompts - a.prompts);
}

export async function getRealSourceOpportunities(filters: RealDataFilters = {}): Promise<CitedSourceRow[] | null> {
  const sources = await getRealCitedSources(filters);
  if (!sources) return null;
  const opportunities = sources.filter((s) => s.myBrandMentions === 0);
  return opportunities.length > 0 ? opportunities : null;
}
