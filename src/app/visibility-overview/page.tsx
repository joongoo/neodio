import { VisibilityOverviewClient } from "@/components/visibility-overview/VisibilityOverviewClient";
import { DateRange, DEFAULT_ORG_ID, db, VisibilityTableRow } from "@/lib/db";
import {
  getRealCitedPages,
  getRealCitedSources,
  getRealMentionsByMarket,
  getRealMentionsByModel,
  getRealSourceOpportunities,
  getRealStatSeries,
  getRealTopBrands,
  getRealTopicRows,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { sourceOpportunityRecommendations } from "@/lib/db/data/sourceOpportunityRecommendations";
import { getTopicOpportunityTargets } from "@/lib/backend/topicOpportunityTargets";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";

const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];
const OWN_BRAND_ID = "brand-neodigm";

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

  const [org, statCardsSeed, mentionsByModelSeed, mentionsByMarketSeed, topicCategories, promptLibraryRowsRaw, trackedRows, deletedIds, targetUrls, ownBrand] =
    await Promise.all([
      db.organizations.get(orgId),
      db.visibilityOverview.getStatCards(orgId, range),
      db.visibilityOverview.getMentionsByModel(orgId),
      db.visibilityOverview.getMentionsByMarket(orgId),
      db.visibilityOverview.getTopicCategories(orgId),
      db.promptLibrary.list(orgId),
      listTrackedTopics(),
      getDeletedLibraryRowIds(),
      getTopicOpportunityTargets(),
      getManagedBrand(orgId, OWN_BRAND_ID),
    ]);
  // 토픽 기회에 "이미 프롬프트 라이브러리에 추가됐는지" 배지를 달기 위한
  // 실제 라이브러리 프롬프트 문장 전체 — 프롬프트 전략 페이지와 동일한
  // 삭제된 시드 필터링을 적용한다.
  const libraryPrompts = [...promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id)), ...trackedRows].map((r) => r.prompt);
  // 브랜드 상세에서 등록한 "획득 콘텐츠 소스"는 아직 인용이 없어도
  // "인용된 소스"/"소스 기회" 표에 나타나야 등록/삭제가 실제로 반영된다.
  const trackedDomains = ownBrand?.earnedContentSources ?? [];

  const [realStats, realMentionsByModel, realMentionsByMarket, realTopicRows, realTopBrands, realCitedPages, realCitedSources, realSourceOpportunities] = demo
    ? [null, null, null, null, null, null, null, null]
    : await Promise.all([
        getRealStatSeries(range),
        getRealMentionsByModel(range),
        getRealMentionsByMarket(range),
        getRealTopicRows({}, { libraryPrompts, targetUrls }),
        getRealTopBrands(),
        getRealCitedPages(),
        getRealCitedSources({}, { trackedDomains }),
        getRealSourceOpportunities({}, { trackedDomains }),
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
  // "top-prompts"/"topic-opportunities"는 수집 로그에 입력한 키워드
  // (rawMetadata.query)를 토픽처럼 묶은 것. 나머지 4개(상위 브랜드/인용
  // 페이지·소스/소스 기회)는 citations/mentions를 브랜드·URL·도메인 단위로
  // 집계 — 전부 URL 인스펙터와 같은 실 인용 파이프라인을 쓴다.
  if (realTopicRows) {
    topicsByCategory["top-prompts"] = realTopicRows.topPrompts;
    topicsByCategory["topic-opportunities"] = realTopicRows.opportunities;
  }
  if (realTopBrands) topicsByCategory["latest-top-brands"] = realTopBrands;
  if (realCitedPages) topicsByCategory["cited-pages"] = realCitedPages;
  if (realCitedSources) topicsByCategory["cited-sources"] = realCitedSources;
  // 도메인별 LLM 추천(sourceOpportunityRecommendations.ts)이 채워져 있으면
  // 실측 집계 행에 recommendation/reasoning을 덧붙인다 — LLM API 연동 전까지
  // 사람이 채운 값을 그대로 붙이는 다리 역할.
  if (realSourceOpportunities) {
    topicsByCategory["source-opportunities"] = realSourceOpportunities.map((row) => ({
      ...row,
      ...sourceOpportunityRecommendations[row.domain],
    }));
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
