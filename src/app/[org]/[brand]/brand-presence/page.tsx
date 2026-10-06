import { BrandPresenceClient } from "@/components/brand-presence/BrandPresenceClient";
import { db } from "@/lib/db";
import {
  getRealDataInsights,
  getRealMarketWeeklyTracking,
  getRealModelTopicMatrix,
  getRealCollectionQuality,
  getRealPlacementStats,
  getRealPromptMetricsByWeek,
  getRealSentimentMovers,
  getRealSentimentSeries,
  getRealShareOfVoice,
  getRealStatSeries,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { EMPTY_BRAND_PRESENCE } from "@/lib/db/data/emptyOrg";
import { seedLlmModels } from "@/lib/db/data/seed";

const RANGE = "4w" as const;

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandPresencePage() {
  const tenant = await getCurrentTenant();
  const demo = await isDemoMode();
  const [statCardsSeed, data] = await Promise.all([
    db.brandPresence.getStatCards(tenant.orgId),
    db.brandPresence.get(tenant.orgId).then((d) => d ?? EMPTY_BRAND_PRESENCE),
  ]);
  if (!data) return null;

  const [realStats, realSentiment, realWeeklyTracking, realPromptMetrics, realDataInsights, realShareOfVoice, realMovers, realMatrix, realQuality, realPlacement] = demo
    ? [null, null, null, null, null, null, null, null, null, null]
    : await Promise.all([
        getRealStatSeries(RANGE),
        getRealSentimentSeries(RANGE),
        getRealMarketWeeklyTracking(RANGE),
        getRealPromptMetricsByWeek(RANGE),
        getRealDataInsights(),
        getRealShareOfVoice(),
        getRealSentimentMovers(RANGE),
        getRealModelTopicMatrix(),
        getRealCollectionQuality(),
        getRealPlacementStats(),
      ]);

  // 상단 "모델" 필터가 Share of Voice에도 걸리도록 모델별로 따로 계산해 둔다(수집 데이터가 있는 모델만).
  const shareOfVoiceByModel = demo
    ? undefined
    : Object.fromEntries(
        (await Promise.all(seedLlmModels.map(async (m) => [m.name, await getRealShareOfVoice({ llmModelId: m.id })] as const))).filter(
          (entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null
        )
      );

  // 개요/가시성 개요와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴.
  // 개선/하락 상위 항목(감성 무버)은 같은 (키워드, 모델) 조합을 최소 2개
  // 주에 걸쳐 반복 수집해야 계산할 수 있다 — 지금은 대부분 한 주 안에서만
  // 수집돼서 realMovers가 null이라 mock이 보이지만, 같은 키워드로 수집을
  // 반복해 데이터가 쌓이면 코드 변경 없이 자동으로 실 데이터로 바뀐다.
  const statCards = statCardsSeed.map((stat) => {
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });

  return (
    <BrandPresenceClient
      statCards={statCards}
      data={{
        ...data,
        sentimentByWeek: realSentiment ?? data.sentimentByWeek,
        mentionsByWeek: realWeeklyTracking?.mentionsByWeek ?? data.mentionsByWeek,
        citationsByWeek: realWeeklyTracking?.citationsByWeek ?? data.citationsByWeek,
        modelTopicMatrix: realMatrix ?? undefined,
        placement: realPlacement ?? undefined,
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
