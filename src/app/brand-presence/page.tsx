import { BrandPresenceClient } from "@/components/brand-presence/BrandPresenceClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import {
  getRealDataInsights,
  getRealMarketWeeklyTracking,
  getRealPromptMetricsByWeek,
  getRealSentimentSeries,
  getRealShareOfVoice,
  getRealStatSeries,
} from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";

const RANGE = "4w" as const;

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandPresencePage() {
  const demo = await isDemoMode();
  const [statCardsSeed, data] = await Promise.all([
    db.brandPresence.getStatCards(DEFAULT_ORG_ID),
    db.brandPresence.get(DEFAULT_ORG_ID),
  ]);
  if (!data) return null;

  const [realStats, realSentiment, realWeeklyTracking, realPromptMetrics, realDataInsights, realShareOfVoice] = demo
    ? [null, null, null, null, null, null]
    : await Promise.all([
        getRealStatSeries(RANGE),
        getRealSentimentSeries(RANGE),
        getRealMarketWeeklyTracking(RANGE),
        getRealPromptMetricsByWeek(RANGE),
        getRealDataInsights(),
        getRealShareOfVoice(),
      ]);

  // 개요/가시성 개요와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴.
  // 개선/하락 상위 항목(감성 무버)만 여전히 mock — "이 프롬프트가 지난
  // 실행 대비 감성이 바뀌었다"는 시계열 비교가 필요한데, 같은 쿼리를 여러
  // 주에 걸쳐 반복 수집한 데이터가 충분히 쌓이기 전까진 신뢰할 수 있게
  // 계산할 방법이 없다.
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
        promptMetricsByWeek: realPromptMetrics ?? data.promptMetricsByWeek,
        dataInsights: realDataInsights ?? data.dataInsights,
        shareOfVoice: realShareOfVoice ?? data.shareOfVoice,
      }}
    />
  );
}
