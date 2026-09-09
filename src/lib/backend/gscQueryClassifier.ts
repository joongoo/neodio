// GSC 실측 검색어를 GEO/LLMO 관점에서 우선순위화하기 위한 규칙 기반 분류기.
// LLM 없이도 할 수 있는 부분만 담당한다 — 실제 자연어 프롬프트 생성/의미
// 판단은 여전히 사람이 LLM에 물어서 채운다 (gscKeywordPrompts.ts).
export type GscQueryType =
  | "brand"
  | "category"
  | "problem_need"
  | "solution"
  | "commercial_vendor"
  | "event_navigational";

const VENDOR_WORDS = ["업체", "대행사", "파트너", "컨설팅", "에이전시", "구축", "운영 대행"];
const SOLUTION_WORDS = ["marketo", "마케토", "hubspot", "허브스팟", "aem", "salesforce", "세일즈포스"];
const PROBLEM_WORDS = ["확보", "너처링", "전환", "매출 확대", "리드 관리", "고객 확보"];
const EVENT_WORDS = ["forum", "포럼", "summit", "서밋", "컨퍼런스", "세미나", "conference", "webinar", "웨비나"];

export function classifyGscQuery(query: string, brandNames: string[] = ["네오다임", "neodigm"]): GscQueryType {
  const q = query.toLowerCase();

  if (brandNames.some((b) => q === b.toLowerCase() || q.includes(b.toLowerCase()))) return "brand";
  if (EVENT_WORDS.some((w) => q.includes(w))) return "event_navigational";
  if (VENDOR_WORDS.some((w) => q.includes(w))) return "commercial_vendor";
  if (SOLUTION_WORDS.some((w) => q.includes(w))) return "solution";
  if (PROBLEM_WORDS.some((w) => q.includes(w))) return "problem_need";
  return "category";
}

// Category/Commercial-Vendor/Solution/Problem-Need는 실제 GEO 기회로
// 취급하고, Brand(브랜드 인지도 모니터링 영역)와 Event/Navigational(특정
// 행사·고객사명 — 카테고리 확장과 무관)은 우선순위를 낮춘다.
export const GSC_QUERY_TYPE_WEIGHT: Record<GscQueryType, number> = {
  category: 1.2,
  commercial_vendor: 1.3,
  solution: 1.1,
  problem_need: 1.1,
  brand: 0.3,
  event_navigational: 0.4,
};

// "노출은 높은데 클릭은 낮은" 쿼리(검색 수요는 있지만 우리 사이트 점유율이
// 낮은 영역)를 우선한다 — impressions * (클릭 안 된 비율) * 쿼리 유형
// 가중치.
export function gscOpportunityScore(impressions: number, ctr: number, type: GscQueryType): number {
  const unclickedRatio = 1 - Math.min(Math.max(ctr, 0), 1);
  return impressions * unclickedRatio * GSC_QUERY_TYPE_WEIGHT[type];
}
