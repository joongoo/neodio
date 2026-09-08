import { VisibilityOverviewClient } from "@/components/visibility-overview/VisibilityOverviewClient";
import { DateRange, DEFAULT_ORG_ID, db, VisibilityTableRow } from "@/lib/db";
import { getRealMentionsByMarket, getRealMentionsByModel, getRealStatSeries } from "@/lib/backend/collectionStatsReader";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다 —
// 개요/수집 로그 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function VisibilityOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const orgId = DEFAULT_ORG_ID;
  const requestedRange = (await searchParams).range;
  const range: DateRange = VALID_RANGES.includes(requestedRange as DateRange)
    ? (requestedRange as DateRange)
    : "4w";

  const [org, statCardsSeed, mentionsByModelSeed, mentionsByMarketSeed, topicCategories, realStats, realMentionsByModel, realMentionsByMarket] =
    await Promise.all([
      db.organizations.get(orgId),
      db.visibilityOverview.getStatCards(orgId, range),
      db.visibilityOverview.getMentionsByModel(orgId),
      db.visibilityOverview.getMentionsByMarket(orgId),
      db.visibilityOverview.getTopicCategories(orgId),
      getRealStatSeries(range),
      getRealMentionsByModel(range),
      getRealMentionsByMarket(range),
    ]);

  // 개요 페이지와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴. 토픽 테이블
  // (성과 좋은 프롬프트/토픽 기회/상위 브랜드/인용 페이지·소스)은 seedTopics에
  // 미리 구성된 토픽·프롬프트 카탈로그가 있어야 해서, 임의 키워드 수집만으로는
  // 아직 실 데이터로 못 만든다 — 계속 mock으로 유지.
  const statCards = statCardsSeed.map((stat) => {
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });
  const mentionsByModel = { ...mentionsByModelSeed, ...(realMentionsByModel ? { mentions: realMentionsByModel } : {}) };
  const mentionsByMarket = { ...mentionsByMarketSeed, ...(realMentionsByMarket ? { mentions: realMentionsByMarket } : {}) };

  const topicsByCategory: Record<string, VisibilityTableRow[]> = {};
  await Promise.all(
    topicCategories.map(async (c) => {
      topicsByCategory[c.id] = await db.visibilityOverview.getTopics(orgId, c.id);
    })
  );

  return (
    <VisibilityOverviewClient
      org={org}
      range={range}
      statCards={statCards}
      mentionsByModel={mentionsByModel}
      mentionsByMarket={mentionsByMarket}
      categories={topicCategories}
      topicsByCategory={topicsByCategory}
    />
  );
}
