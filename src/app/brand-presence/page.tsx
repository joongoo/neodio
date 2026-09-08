import { BrandPresenceClient } from "@/components/brand-presence/BrandPresenceClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealSentimentSeries, getRealStatSeries } from "@/lib/backend/collectionStatsReader";
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

  const [realStats, realSentiment] = demo
    ? [null, null]
    : await Promise.all([getRealStatSeries(RANGE), getRealSentimentSeries(RANGE)]);

  // 개요/가시성 개요와 동일한 "실 데이터가 있으면 mock을 이긴다" 패턴 —
  // 가시성 점수/브랜드 언급/인용 수와 감성 분포만 실 파이프라인이 계산할 수
  // 있고, 마켓 트래킹(주간·브랜드별)·프롬프트 지표·감성 무버·데이터
  // 인사이트·Share of Voice는 아직 실 데이터로 만들 파이프라인이 없어 mock
  // 그대로 유지한다.
  const statCards = statCardsSeed.map((stat) => {
    if (!realStats) return stat;
    if (stat.id === "visibility-score") return { ...stat, ...realStats.visibilityScore };
    if (stat.id === "brand-mentions") return { ...stat, ...realStats.brandMentions };
    if (stat.id === "citations") return { ...stat, ...realStats.citations };
    return stat;
  });
  const sentimentByWeek = realSentiment ?? data.sentimentByWeek;

  return <BrandPresenceClient statCards={statCards} data={{ ...data, sentimentByWeek }} />;
}
