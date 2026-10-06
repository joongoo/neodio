import { BrandPresenceClient } from "@/components/brand-presence/BrandPresenceClient";
import { db } from "@/lib/db";
import {
  getRealDataInsights,
  getRealMarketWeeklyTracking,
  getRealModelTopicMatrix,
  getRealCollectionQuality,
  getRealPlacementStats,
  getRealSentimentEvidence,
  getRealConsistency,
  getRealPromptMetricsByWeek,
  getRealSentimentMovers,
  getRealSentimentSeries,
  getRealShareOfVoice,
  getRealShareOfVoiceByModel,
  getRealStatSeries,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { EMPTY_BRAND_PRESENCE } from "@/lib/db/data/emptyOrg";
import type { QueryScope } from "@/lib/queryScope";

const RANGE = "4w" as const;

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

// 자사 브랜드명이 들어간 질의는 언급되기 쉬워 가시성을 부풀리므로 따로 볼 수 있게 한다.
const SCOPE_BY_LABEL: Record<string, QueryScope> = { "브랜드 질의": "brand", "일반 질의": "nonbrand" };

export default async function BrandPresencePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const params = await searchParams;
  const queryScope = params.scope ? SCOPE_BY_LABEL[params.scope] : undefined;
  const tenant = await getCurrentTenant();
  const demo = await isDemoMode();
  const filters = queryScope ? { queryScope } : {};
  const [statCardsSeed, mockData] = await Promise.all([
    db.brandPresence.getStatCards(tenant.orgId),
    db.brandPresence.get(tenant.orgId).then((d) => d ?? EMPTY_BRAND_PRESENCE),
  ]);
  if (!mockData) return null;

  const [realStats, realSentiment, realWeeklyTracking, realPromptMetrics, realDataInsights, realShareOfVoice, realMovers, realMatrix, realQuality, realPlacement, realSentimentEvidence, realConsistency] = demo
    ? [null, null, null, null, null, null, null, null, null, null, null, null]
    : await Promise.all([
        getRealStatSeries(RANGE, filters),
        getRealSentimentSeries(RANGE, filters),
        getRealMarketWeeklyTracking(RANGE, filters),
        getRealPromptMetricsByWeek(RANGE, filters),
        getRealDataInsights(filters),
        getRealShareOfVoice(filters),
        getRealSentimentMovers(RANGE, filters),
        getRealModelTopicMatrix(undefined, queryScope),
        getRealCollectionQuality(),
        getRealPlacementStats(queryScope),
        getRealSentimentEvidence(undefined, queryScope),
        getRealConsistency(undefined, queryScope),
      ]);

  // 상단 "모델" 필터가 Share of Voice에도 걸리도록 모델별로 계산해 둔다(수집 데이터가 있는 모델만) —
  // 한 번 분석한 결과를 엔진별로 나누므로 엔진 수만큼 다시 읽지 않는다.
  const shareOfVoiceByModel = demo ? undefined : await getRealShareOfVoiceByModel(queryScope);

  // 질의 유형을 골랐는데 그 조건에 맞는 수집이 없으면 샘플(mock) 대신 빈 화면을 보여준다 —
  // 수집 자체가 전혀 없을 때만 샘플로 되돌아간다.
  const filteredEmpty = !!queryScope && !demo && realStats === null && (await getRealStatSeries(RANGE)) !== null;
  const data = filteredEmpty ? EMPTY_BRAND_PRESENCE : mockData;

  // 개요/가시성 개요와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴.
  // 개선/하락 상위 항목(감성 무버)은 같은 (키워드, 모델) 조합을 최소 2개
  // 주에 걸쳐 반복 수집해야 계산할 수 있다 — 지금은 대부분 한 주 안에서만
  // 수집돼서 realMovers가 null이라 mock이 보이지만, 같은 키워드로 수집을
  // 반복해 데이터가 쌓이면 코드 변경 없이 자동으로 실 데이터로 바뀐다.
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

  return (
    <BrandPresenceClient
      statCards={statCards}
      queryScopeLabel={params.scope && SCOPE_BY_LABEL[params.scope] ? params.scope : "전체"}
      data={{
        ...data,
        sentimentByWeek: realSentiment ?? data.sentimentByWeek,
        mentionsByWeek: realWeeklyTracking?.mentionsByWeek ?? data.mentionsByWeek,
        citationsByWeek: realWeeklyTracking?.citationsByWeek ?? data.citationsByWeek,
        modelTopicMatrix: realMatrix ?? undefined,
        placement: realPlacement ?? undefined,
        sentimentEvidence: realSentimentEvidence ?? undefined,
        consistency: realConsistency ?? undefined,
        collectionQuality: realQuality ?? undefined,
        weeklyTrackingIsRate: realWeeklyTracking ? true : undefined,
        promptMetricsByWeek: realPromptMetrics ?? data.promptMetricsByWeek,
        dataInsights: realDataInsights ?? data.dataInsights,
        shareOfVoice: realShareOfVoice ?? data.shareOfVoice,
        shareOfVoiceByModel,
        topMovers: realMovers?.topMovers ?? data.topMovers,
        bottomMovers: realMovers?.bottomMovers ?? data.bottomMovers,
      }}
    />
  );
}
