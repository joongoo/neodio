import { hostnameOfUrl } from "@/lib/normalizeUrl";
import { VisibilityOverviewClient } from "@/components/visibility-overview/VisibilityOverviewClient";
import { db, VisibilityTableRow } from "@/lib/db";
import {
  getRealCitedPages,
  getRealCitedSources,
  getRealMentionsByMarket,
  getRealMentionsByModel,
  getRealSourceOpportunities,
  getRealStatSeries,
  getRealBrandEvidence,
  getRealTopBrands,
  getRealTopicRows,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { SourceOpportunityRecommendation } from "@/lib/db/data/sourceOpportunityRecommendations";
import { getTopicOpportunityTargets } from "@/lib/backend/topicOpportunityTargets";
import { listTrackedTopics, listSeedLibraryRows } from "@/lib/backend/trackedTopics";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getLlmBridgeScope } from "@/lib/backend/llmBridgeStore";
import { listDetectedBrandDecisions } from "@/lib/backend/detectedBrandDecisions";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { parseFilters } from "@/lib/filterOptions";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다 —
// 개요/수집 로그 페이지와 동일한 이유.
export const dynamic = "force-dynamic";

export default async function VisibilityOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; market?: string; model?: string; scope?: string }>;
}) {
  const tenant = await getCurrentTenant();
  const orgId = tenant.orgId;
  // 기간·마켓·모델·질의 유형은 주소(쿼리)로 받아 모든 카드·표를 같은 필터로 서버에서 계산한다.
  const { range, marketLabel, modelLabel, scopeLabel, filters } = parseFilters(await searchParams);
  const demo = await isDemoMode();

  const [org, statCardsSeed, mentionsByModelSeed, mentionsByMarketSeed, topicCategories, promptLibraryRowsRaw, trackedRows, deletedIds, targetUrls, ownBrand, sourceRecommendations, brandDecisions] =
    await Promise.all([
      tenant.org,
      db.visibilityOverview.getStatCards(orgId, range),
      db.visibilityOverview.getMentionsByModel(orgId),
      db.visibilityOverview.getMentionsByMarket(orgId),
      db.visibilityOverview.getTopicCategories(orgId),
      listSeedLibraryRows(orgId, tenant.brandId),
      listTrackedTopics(orgId, tenant.brandId),
      getDeletedLibraryRowIds(orgId),
      getTopicOpportunityTargets(orgId),
      getManagedBrand(orgId, tenant.brandId),
      getLlmBridgeScope<SourceOpportunityRecommendation>(tenant.orgId, "source-recommendation"),
      listDetectedBrandDecisions(orgId, tenant.brandId),
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
        getRealStatSeries(range, filters),
        getRealMentionsByModel(range, filters),
        getRealMentionsByMarket(range, filters),
        getRealTopicRows(filters, { libraryPrompts, targetUrls }),
        getRealTopBrands({ range, includeOwn: true, ...filters }),
        getRealCitedPages(filters),
        getRealCitedSources(filters, { trackedDomains }),
        getRealSourceOpportunities(filters, { trackedDomains }),
      ]);

  // 개요 페이지와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴.
  // 필터를 골랐는데 그 조건에 맞는 수집이 없으면 샘플(mock) 대신 빈 화면을 보여준다 —
  // 수집 자체가 전혀 없을 때만 샘플로 되돌아간다.
  const filteredEmpty = Object.keys(filters).length > 0 && !demo && realStats === null && (await getRealStatSeries(range)) !== null;
  const statCards = statCardsSeed.map((stat) => {
    if (filteredEmpty && ["visibility-score", "brand-mentions", "citations"].includes(stat.id)) {
      return { ...stat, value: 0, decimals: undefined, suffix: undefined, trendUnit: undefined, caption: "선택한 조건에 맞는 수집 데이터가 없어요", trend: { direction: "flat" as const, percent: 0 }, sparkline: [] };
    }
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });
  const EMPTY_RANKED = { mentions: [], visibility: [], exposure: [] };
  const mentionsByModel = filteredEmpty ? EMPTY_RANKED : { ...mentionsByModelSeed, ...(realMentionsByModel ?? {}) };
  const mentionsByMarket = filteredEmpty ? EMPTY_RANKED : { ...mentionsByMarketSeed, ...(realMentionsByMarket ?? {}) };

  const topicsByCategory: Record<string, VisibilityTableRow[]> = {};
  await Promise.all(
    topicCategories.map(async (c) => {
      topicsByCategory[c.id] = filteredEmpty ? [] : await db.visibilityOverview.getTopics(orgId, c.id);
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
  if (realTopBrands) {
    topicsByCategory["latest-top-brands"] = realTopBrands.map((row) => {
      if (row.isOwn) return row;
      const decision = brandDecisions.get(row.brand.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim());
      return { ...row, decisionStatus: decision?.status, evidenceDomain: row.evidenceDomain ?? decision?.evidenceDomain };
    });
  }
  if (realCitedPages) topicsByCategory["cited-pages"] = realCitedPages;
  // 도메인별 LLM 추천(DB 등록 모달로 채운 .tmp/llm-bridge/source-recommendation.json)이
  // 있으면 실측 집계 행에 recommendation/reasoning을 덧붙인다 — LLM API 연동
  // 전까지 사람이 채운 값을 그대로 붙이는 다리 역할.
  if (realCitedSources) {
    topicsByCategory["cited-sources"] = realCitedSources.map((row) => ({ ...row, ...sourceRecommendations[row.domain] }));
  }
  // 소스 기회는 "인용된 소스"의 부분집합이라 행을 한 번 더 보내지 않고 도메인 목록만 보낸다 —
  // 화면(VisibilityOverviewClient)이 인용된 소스 행에서 다시 만든다.
  let sourceOpportunityDomains: string[] | undefined;
  if (realSourceOpportunities && realCitedSources) {
    sourceOpportunityDomains = realSourceOpportunities.map((row) => row.domain);
    topicsByCategory["source-opportunities"] = [];
  } else if (realSourceOpportunities) {
    topicsByCategory["source-opportunities"] = realSourceOpportunities.map((row) => ({
      ...row,
      ...sourceRecommendations[row.domain],
    }));
  }

  // 브랜드 최적화의 역할 분류 근거 — 등록된 기타 브랜드와 순위표에 나온 브랜드(자사 제외)의 답변 근거.
  const brandEvidence = demo || !ownBrand
    ? undefined
    : await getRealBrandEvidence([...new Set([...ownBrand.otherBrands.map((b) => b.name), ...(realTopBrands ?? []).filter((row) => !row.isOwn).map((row) => row.brand)])]);

  return (
    <VisibilityOverviewClient
      org={org}
      range={range}
      marketLabel={marketLabel}
      modelLabel={modelLabel}
      queryScopeLabel={scopeLabel}
      serverFiltered={!demo}
      statCards={statCards}
      mentionsByModel={mentionsByModel}
      mentionsByMarket={mentionsByMarket}
      categories={topicCategories}
      topicsByCategory={topicsByCategory}
      sourceOpportunityDomains={sourceOpportunityDomains}
      brandContext={
        ownBrand
          ? {
              own: {
                name: ownBrand.name,
                domain: hostnameOfUrl(ownBrand.url),
                aliases: ownBrand.aliases,
                description: ownBrand.description,
                industry: ownBrand.industry,
                markets: ownBrand.markets,
              },
              registered: ownBrand.otherBrands.map((b) => ({ name: b.name, aliases: b.aliases, kind: b.kind, tier: b.tier, description: b.description, origin: b.origin })),
              evidence: brandEvidence,
            }
          : null
      }
    />
  );
}
