import {
  getRealCitedSources, getRealCollectionQuality, getRealConsistency, getRealMarketComparison, getRealMentionsByModel, getRealPlacementStats,
  getRealReportFacts, getRealStatSeries, getRealTopBrands, getRealTopicRows, type RealDataFilters, type RealMetric,
} from "./collectionStatsReader";
import { getPromptStore } from "./database";
import { RANGE_LABEL, type ReportKpi, type ReportRange, type ReportSnapshot } from "@/lib/report";
import type { ManagedBrand } from "@/lib/db/types";

// 리포트 스냅샷 만들기 — 대시보드와 같은 읽기 함수를 같은 필터로 불러 한 번에 고정한다. 서버 전용.

const toKpi = (metric: RealMetric, unit: "%" | "%p"): ReportKpi => ({
  value: metric.value, decimals: metric.decimals ?? 1, suffix: metric.suffix, trend: metric.trend, trendUnit: unit, sparkline: metric.sparkline, caption: metric.caption,
});

export async function buildReportSnapshot(params: {
  orgId: string;
  brand: ManagedBrand;
  range: ReportRange;
  filters: RealDataFilters;
  filterLabels: { market: string; model: string; scope: string };
}): Promise<ReportSnapshot> {
  const { orgId, brand, range, filters } = params;
  const [stats, ranked, placement, competitors, topBrands, topicRows, sources, quality, consistency, facts] = await Promise.all([
    getRealStatSeries(range, filters),
    getRealMentionsByModel(range, filters),
    getRealPlacementStats(filters),
    getRealMarketComparison(range, filters),
    getRealTopBrands({ ...filters, range, includeOwn: true }),
    getRealTopicRows({ ...filters, range }),
    getRealCitedSources({ ...filters, range }, { trackedDomains: brand.earnedContentSources }),
    getRealCollectionQuality(filters),
    getRealConsistency(10, filters),
    getRealReportFacts(range, filters),
  ]);

  const store = await getPromptStore();
  const weeks = range === "1w" ? 1 : range === "2w" ? 2 : 4;
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
  const [changes, versions] = await Promise.all([
    store.listChanges(orgId, { brandId: brand.id, limit: 200, includeUsers: false }),
    store.listConfigVersions(orgId, brand.id),
  ]);

  const topic = (row: { topic: string; visibility: number; prompts: unknown[] }) => ({ topic: row.topic, visibility: row.visibility, runs: row.prompts.length });
  const kpis = stats ? { score: toKpi(stats.visibilityScore, "%"), mention: toKpi(stats.brandMentions, "%p"), citation: toKpi(stats.citations, "%p") } : null;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    brand: { name: brand.name, domain: brand.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "") },
    period: { range, label: RANGE_LABEL[range], weekLabels: kpis?.score.sparkline.map((p) => p.week) ?? [] },
    filters: params.filterLabels,
    kpis,
    engines: (ranked?.visibility ?? []).map((row) => ({ label: row.label, visibility: row.value })),
    placement: placement ?? [],
    competitors: (competitors ?? []).slice(0, 8).map((row) => ({ brand: row.brand, isSelf: row.isSelf, mentionRate: row.mentions, citationRate: row.citations })),
    topBrands: (topBrands ?? []).slice(0, 8).map((row) => ({ brand: row.brand, mentions: row.mentions, totalAnswers: row.totalAnswers ?? 0, isOwn: !!row.isOwn })),
    topics: {
      strong: (topicRows?.topPrompts ?? []).slice(0, 8).map(topic),
      gaps: (topicRows?.opportunities ?? []).slice(0, 8).map(topic),
    },
    sources: (sources ?? []).slice(0, 10).map((row) => ({
      domain: row.domain, prompts: row.prompts, myBrandMentions: row.myBrandMentions,
      coMentioned: (row.coMentionedCompetitors ?? []).map((c) => `${c.brand} ${c.answers}`).join(", "),
    })),
    appendix: {
      measurement: { runs: facts?.runs ?? 0, observations: facts?.observations ?? 0, engines: facts?.engines ?? [], markets: facts?.markets ?? [] },
      quality: quality ?? [],
      consistency,
      composition: { brandQueryRuns: facts?.brandQueryRuns ?? 0, generalQueryRuns: facts?.generalQueryRuns ?? 0, categories: (facts?.categories ?? []).slice(0, 8) },
      registeredCompetitors: brand.otherBrands.map((b) => b.name),
      changes: changes.filter((c) => c.at >= since).slice(0, 15).map((c) => ({ at: c.at, summary: c.summary, entityType: c.entityType })),
      versions: versions.filter((v) => v.createdAt >= since).map((v) => ({ version: v.version, label: v.label, createdAt: v.createdAt })),
    },
  };
}
