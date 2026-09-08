import { listCollectedRuns } from "./collectionRuns";
import { processPromptRuns } from "./processing";
import { formatWeekLabel, toUtcSundayWeekStart } from "./processing/date";
import { seedBrands } from "@/lib/db/data/seed";
import { DateRange, StatCard } from "@/lib/db/types";

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

// Builds the same 3 real-data-backed metrics (visibility score, brand
// mentions, citations) the collection-runs page already computes on the
// fly from actual collected files — bucketed by week so Overview's range
// filter (1w/2w/4w) and trend-vs-previous-period behave the same as the
// mock snapshot path it replaces. Returns null when nothing's been
// collected yet, so the caller can fall back to the seeded snapshot cards.
export async function getRealStatSeries(range: DateRange): Promise<RealStatSeries | null> {
  const runFiles = await listCollectedRuns();
  if (runFiles.length === 0) return null;

  const promptRuns = runFiles.map((f) => f.promptRun);
  const processed = processPromptRuns({ organizationId: ORG_ID, ownBrandId: OWN_BRAND_ID, promptRuns, brands: seedBrands });

  const weekOfRun = new Map<string, string>();
  for (const run of promptRuns) {
    if (run.status !== "success") continue;
    weekOfRun.set(run.id, toUtcSundayWeekStart(run.runAt));
  }

  const weeks = Array.from(new Set(weekOfRun.values())).sort();
  if (weeks.length === 0) return null;

  const mentionsByWeek = new Map(weeks.map((w) => [w, 0]));
  const citationsByWeek = new Map(weeks.map((w) => [w, 0]));
  const visibilityByWeek = new Map<string, number[]>(weeks.map((w) => [w, []]));

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

  const windowSize = RANGE_WEEKS[range];
  const currentWeeks = weeks.slice(-windowSize);
  const previousWeeks = weeks.slice(-windowSize * 2, -windowSize);

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
