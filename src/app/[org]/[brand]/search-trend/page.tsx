import { SearchTrendClient } from "@/components/search-trend/SearchTrendClient";
import { getRealBrandMentionWeeks, getRealTopBrands } from "@/lib/backend/collectionStatsReader";
import { listDetectedBrandDecisions } from "@/lib/backend/detectedBrandDecisions";
import { isDemoMode } from "@/lib/backend/demoMode";
import { DatalabError, fetchSearchTrend, isDatalabConfigured } from "@/lib/backend/naverDatalab";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { defaultDateRange, TrendResult } from "@/lib/searchTrend";

// 실시간 API 조회 + 수집 데이터에 따라 달라지므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

const TOP_BRAND_COUNT = 3;
const MAX_GROUPS = 5;
const MAX_KEYWORDS = 20;

const normalizeName = (name: string) => name.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();

function keywordsOf(name: string, aliases: string[]) {
  return Array.from(new Set([name, ...aliases].map((k) => k.trim()).filter(Boolean))).slice(0, MAX_KEYWORDS);
}

export default async function SearchTrendPage() {
  const tenant = await getCurrentTenant();
  const demo = await isDemoMode();
  const configured = isDatalabConfigured();
  const timeUnit = "month" as const;
  const range = defaultDateRange(timeUnit);

  // 기본 주제어: 자사 + 비교 대상 상위 3개.
  //  1) 브랜드 관리에서 "경쟁사"로 분류된 기타 브랜드가 있으면 그것만(핵심 등급 우선, 같은 등급은 최근 4주 언급 답변이 많은 순).
  //  2) 아직 역할 분류 전이면 가시성 개요 "최신 상위 브랜드" 중 등록 브랜드·승인한 후보(경쟁사가 아닐 수 있다).
  //  3) 수집 데이터도 없으면 등록한 기타 브랜드 앞 3개.
  // 이름은 브랜드 이름 그대로 두어야 "AI 답변 교차" 탭에서 그 브랜드의 언급과 짝지어진다.
  const brand = tenant.brand;
  const registered = new Map((brand?.otherBrands ?? []).map((o) => [normalizeName(o.name), o]));
  const topBrands = demo ? null : await getRealTopBrands({ range: "4w" }).catch(() => null);
  const rank = new Map((topBrands ?? []).map((row, i) => [normalizeName(row.brand), i]));
  const toGroup = (o: { name: string; aliases: string[] }) => ({ groupName: o.name, keywords: keywordsOf(o.name, o.aliases) });

  // 등급 순(핵심 → 인접 → 상위 시장, 등급 미정은 그 뒤), 같은 등급 안에서는 언급 답변이 많은 순. 소규모 전문 업체는 핵심 경쟁사가 아니므로 뺀다.
  const tierRank = (tier: string | undefined) => (tier === "core" ? 0 : tier === "adjacent" ? 1 : tier === "enterprise" ? 2 : 3);
  const classifiedCompetitors = (brand?.otherBrands ?? [])
    .filter((o) => o.kind === "competitor" && o.tier !== "niche")
    .sort(
      (a, b) =>
        tierRank(a.tier) - tierRank(b.tier) || (rank.get(normalizeName(a.name)) ?? Infinity) - (rank.get(normalizeName(b.name)) ?? Infinity)
    )
    .slice(0, TOP_BRAND_COUNT)
    .map(toGroup);

  const decisions = !classifiedCompetitors.length && topBrands ? await listDetectedBrandDecisions(tenant.orgId, tenant.brandId) : null;
  const topCompetitors = classifiedCompetitors.length
    ? []
    : (topBrands ?? [])
        // 신규 업체 후보(detected)는 직책·일반 개념어가 섞여 있어(예: CIO, Lead Scoring) 사람이 승인한 것만 쓴다.
        .filter((row) => row.source === "tracked" || decisions?.get(normalizeName(row.brand))?.status === "approved")
        .slice(0, TOP_BRAND_COUNT)
        .map((row) => toGroup({ name: row.brand, aliases: registered.get(normalizeName(row.brand))?.aliases ?? [] }));
  const fallbackCompetitors = (brand?.otherBrands ?? []).slice(0, TOP_BRAND_COUNT).map(toGroup);

  const competitors = classifiedCompetitors.length ? classifiedCompetitors : topCompetitors.length ? topCompetitors : fallbackCompetitors;
  const groups = brand ? [toGroup({ name: brand.name, aliases: brand.aliases }), ...competitors].slice(0, MAX_GROUPS) : [];
  const groupsSource = classifiedCompetitors.length
    ? `자사 + 브랜드 관리에서 "경쟁사"로 분류한 브랜드(핵심 등급 우선) ${classifiedCompetitors.length}개`
    : topCompetitors.length
      ? `자사 + 가시성 개요 "최신 상위 브랜드" 최근 4주 상위 ${topCompetitors.length}개 (경쟁사 분류 전 — 경쟁사가 아닐 수 있음)`
      : "자사 + 브랜드 관리에 등록한 기타 브랜드(수집된 상위 브랜드 데이터가 없어 대체)";

  let initialResult: TrendResult | null = null;
  let initialError: string | null = null;
  if (configured && groups.length > 0) {
    try {
      const res = await fetchSearchTrend({ ...range, timeUnit, keywordGroups: groups });
      initialResult = {
        startDate: res.startDate,
        endDate: res.endDate,
        timeUnit: res.timeUnit,
        series: res.results.map((r) => ({ groupName: r.title, keywords: r.keywords, data: r.data })),
      };
    } catch (error) {
      if (!(error instanceof DatalabError)) throw error;
      initialError = error.message;
    }
  }

  const mentionWeeks = demo ? null : await getRealBrandMentionWeeks();

  return (
    <SearchTrendClient
      configured={configured}
      initialGroups={groups}
      groupsSource={groupsSource}
      initialQuery={{ ...range, timeUnit }}
      initialResult={initialResult}
      initialError={initialError}
      mentionWeeks={mentionWeeks}
    />
  );
}
