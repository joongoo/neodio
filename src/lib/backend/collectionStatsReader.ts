import { listCollectedRuns } from "./collectionRuns";
import { processPromptRuns } from "./processing";
import { formatWeekLabel, toUtcSundayWeekStart } from "./processing/date";
import { seedBrands, seedLlmModels, seedMarkets } from "@/lib/db/data/seed";
import { DateRange, MarketComparisonRow, RankedRow, SentimentWeek, StatCard, TopicPromptRow, TopicRow } from "@/lib/db/types";

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

// Ranked "우리 브랜드가 언급된 횟수" broken down by which LLM/market produced
// the run — Visibility Overview's "Mentions by Model"/"Mentions by Market"
// panels. Only the "mentions" tab has a well-defined real computation this
// way; "visibility"/"exposure" need a per-model scoring formula the pipeline
// doesn't compute yet, so callers keep those two tabs on the seeded mock and
// only swap in this real "mentions" list.
async function getRealMentionsBy(
  range: DateRange,
  groupKey: (run: { llmModelId: string; marketId: string }) => string | undefined,
  filters: RealDataFilters
): Promise<RankedRow[] | null> {
  const result = await getProcessedWithWeeks(range, filters);
  if (!result) return null;
  const { processed, weekOfRun, currentWeeks, runsById } = result;
  const currentWeekSet = new Set(currentWeeks);

  const countByGroup = new Map<string, number>();
  for (const mention of processed.mentions) {
    if (mention.brandId !== OWN_BRAND_ID || !mention.isPresent) continue;
    const week = weekOfRun.get(mention.promptRunId);
    if (!week || !currentWeekSet.has(week)) continue;
    const run = runsById.get(mention.promptRunId);
    const group = run && groupKey(run);
    if (!group) continue;
    countByGroup.set(group, (countByGroup.get(group) ?? 0) + 1);
  }
  if (countByGroup.size === 0) return null;

  const total = Array.from(countByGroup.values()).reduce((s, v) => s + v, 0);
  return Array.from(countByGroup.entries())
    .map(([label, value]) => ({ label, value, display: `${value} (${Math.round((value / total) * 100)}%)` }))
    .sort((a, b) => b.value - a.value);
}

export async function getRealMentionsByModel(range: DateRange, filters: RealDataFilters = {}): Promise<RankedRow[] | null> {
  return getRealMentionsBy(range, (run) => seedLlmModels.find((m) => m.id === run.llmModelId)?.name, filters);
}

export async function getRealMentionsByMarket(range: DateRange, filters: RealDataFilters = {}): Promise<RankedRow[] | null> {
  return getRealMentionsBy(range, (run) => seedMarkets.find((m) => m.id === run.marketId)?.label, filters);
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
export async function getRealTopicRows(filters: RealDataFilters = {}): Promise<RealTopicRows | null> {
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

  const topPrompts: TopicRow[] = [];
  const opportunities: TopicRow[] = [];

  for (const [query, runIds] of runIdsByQuery) {
    const mentionCount = runIds.filter((id) => ownMentionByRun.get(id)).length;
    const firstRun = runsById.get(runIds[0])!;
    const market = seedMarkets.find((m) => m.id === firstRun.marketId)?.label ?? firstRun.marketId;

    const prompts: TopicPromptRow[] = runIds.map((id) => {
      const run = runsById.get(id)!;
      return {
        id,
        prompt: query,
        model: seedLlmModels.find((m) => m.id === run.llmModelId)?.name ?? run.llmModelId,
        myBrand: ownMentionByRun.get(id) ? "노출" : "미노출",
        brand: String(otherMentionCountByRun.get(id) ?? 0),
        source: String(citationCountByRun.get(id) ?? 0),
        market: seedMarkets.find((m) => m.id === run.marketId)?.label ?? run.marketId,
      };
    });

    const row: TopicRow = {
      id: `real-${query}`,
      topic: query,
      mentions: mentionCount,
      visibility: Math.round((mentionCount / runIds.length) * 100),
      market,
      prompts,
    };

    (mentionCount > 0 ? topPrompts : opportunities).push(row);
  }

  topPrompts.sort((a, b) => b.mentions - a.mentions);
  opportunities.sort((a, b) => b.prompts.length - a.prompts.length);

  if (topPrompts.length === 0 && opportunities.length === 0) return null;
  return { topPrompts, opportunities };
}
