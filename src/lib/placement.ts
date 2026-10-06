import type { BrandSeed } from "@/lib/db/types";
import { findBrandMentions, normalizeText } from "@/lib/backend/processing/text";

// "얼마나 눈에 띄게" 노출되는가 — 언급 여부(가시성)와 별개로, 언급된 답변 안에서 자사가
// 몇 번째로, 답변의 어느 지점에 나오는지와 자사 인용이 출처 목록의 몇 번째인지를 잰다.
// 저장된 분석(캐시)을 건드리지 않고 원문에서 바로 계산하는 순수 함수.

/** 답변 앞쪽 몇 %까지를 "앞부분"으로 볼지. */
export const EARLY_RATIO = 0.25;

export interface RunPlacement {
  /** 자사가 답변에 언급됐는지. */
  mentioned: boolean;
  /** 추적 중인 브랜드(자사+경쟁사) 중 자사의 언급 순서(1 = 가장 먼저). 언급 안 됐으면 null. */
  rank: number | null;
  /** 자사 외에 함께 언급된 추적 브랜드 수. */
  competitorsPresent: number;
  /** 답변 본문에서 자사가 처음 나온 위치(0 = 맨 앞, 1 = 맨 끝). */
  offsetRatio: number | null;
  /** 자사 도메인 인용이 출처 목록에서 처음 나온 순서(1부터). 자사 인용이 없으면 null. */
  firstOwnCitationPosition: number | null;
}

export function analyzeRunPlacement(
  rawResponse: string,
  brands: BrandSeed[],
  ownBrandId: string,
  citations: { isOwnDomain: boolean }[]
): RunPlacement {
  const ordered = findBrandMentions(rawResponse, brands).filter((m) => m.index !== null);
  const ownIdx = ordered.findIndex((m) => m.brand.id === ownBrandId);
  const length = Math.max(1, normalizeText(rawResponse).length);
  const ownCitationIdx = citations.findIndex((c) => c.isOwnDomain);
  return {
    mentioned: ownIdx >= 0,
    rank: ownIdx >= 0 ? ownIdx + 1 : null,
    competitorsPresent: ownIdx >= 0 ? ordered.length - 1 : ordered.length,
    offsetRatio: ownIdx >= 0 ? (ordered[ownIdx].index as number) / length : null,
    firstOwnCitationPosition: ownCitationIdx >= 0 ? ownCitationIdx + 1 : null,
  };
}

export interface PlacementSummary {
  /** 비교 단위의 이름(엔진 이름 또는 "전체"). */
  label: string;
  /** 분석한 답변 수. */
  answers: number;
  /** 자사가 언급된 답변 수. */
  mentioned: number;
  /** 언급된 답변 중 경쟁사도 함께 나온 답변 수(= 순서를 비교할 수 있는 답변). */
  contested: number;
  /** 경쟁사와 함께 나온 답변 중 자사가 가장 먼저 언급된 비율(%). 비교 대상이 없으면 null. */
  firstShare: number | null;
  /** 경쟁사와 함께 나온 답변에서 자사의 평균 언급 순서. */
  avgRank: number | null;
  /** 언급된 답변 중 앞부분(EARLY_RATIO)에서 처음 나온 비율(%). */
  earlyShare: number | null;
  /** 자사 인용이 있는 답변 수. */
  cited: number;
  /** 자사 인용의 평균 출처 순서(첫 자사 인용 기준). */
  avgCitationPosition: number | null;
  /** 자사 인용이 출처 상위 3위 안에 있는 답변 비율(%). */
  top3CitationShare: number | null;
}

const pct = (hit: number, total: number) => (total > 0 ? Math.round((hit / total) * 100) : null);
const avg = (values: number[]) => (values.length > 0 ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)) : null);

export function summarizePlacements(label: string, placements: RunPlacement[]): PlacementSummary {
  const mentioned = placements.filter((p) => p.mentioned);
  const contested = mentioned.filter((p) => p.competitorsPresent > 0);
  const cited = placements.filter((p) => p.firstOwnCitationPosition !== null);
  return {
    label,
    answers: placements.length,
    mentioned: mentioned.length,
    contested: contested.length,
    firstShare: pct(contested.filter((p) => p.rank === 1).length, contested.length),
    avgRank: avg(contested.map((p) => p.rank as number)),
    earlyShare: pct(mentioned.filter((p) => (p.offsetRatio as number) <= EARLY_RATIO).length, mentioned.length),
    cited: cited.length,
    avgCitationPosition: avg(cited.map((p) => p.firstOwnCitationPosition as number)),
    top3CitationShare: pct(cited.filter((p) => (p.firstOwnCitationPosition as number) <= 3).length, cited.length),
  };
}
