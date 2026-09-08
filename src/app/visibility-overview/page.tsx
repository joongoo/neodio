import { VisibilityOverviewClient } from "@/components/visibility-overview/VisibilityOverviewClient";
import { DateRange, DEFAULT_ORG_ID, db, VisibilityTableRow } from "@/lib/db";
import {
  getRealMentionsByMarket,
  getRealMentionsByModel,
  getRealStatSeries,
  getRealTopicRows,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";

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
  const demo = await isDemoMode();

  const [org, statCardsSeed, mentionsByModelSeed, mentionsByMarketSeed, topicCategories] = await Promise.all([
    db.organizations.get(orgId),
    db.visibilityOverview.getStatCards(orgId, range),
    db.visibilityOverview.getMentionsByModel(orgId),
    db.visibilityOverview.getMentionsByMarket(orgId),
    db.visibilityOverview.getTopicCategories(orgId),
  ]);
  const [realStats, realMentionsByModel, realMentionsByMarket, realTopicRows] = demo
    ? [null, null, null, null]
    : await Promise.all([
        getRealStatSeries(range),
        getRealMentionsByModel(range),
        getRealMentionsByMarket(range),
        getRealTopicRows(),
      ]);

  // 개요 페이지와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴.
  const statCards = statCardsSeed.map((stat) => {
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });
  const mentionsByModel = { ...mentionsByModelSeed, ...(realMentionsByModel ?? {}) };
  const mentionsByMarket = { ...mentionsByMarketSeed, ...(realMentionsByMarket ?? {}) };

  const topicsByCategory: Record<string, VisibilityTableRow[]> = {};
  await Promise.all(
    topicCategories.map(async (c) => {
      topicsByCategory[c.id] = await db.visibilityOverview.getTopics(orgId, c.id);
    })
  );
  // "top-prompts"/"topic-opportunities"만 실 데이터로 교체 — 수집 로그에
  // 입력한 키워드(rawMetadata.query)를 토픽처럼 묶은 것. 나머지 4개 카테고리
  // (상위 브랜드/인용 페이지·소스)는 아직 실 파이프라인이 계산하지 않는
  // 별도 지표라 mock 유지.
  if (realTopicRows) {
    topicsByCategory["top-prompts"] = realTopicRows.topPrompts;
    topicsByCategory["topic-opportunities"] = realTopicRows.opportunities;
  }

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
