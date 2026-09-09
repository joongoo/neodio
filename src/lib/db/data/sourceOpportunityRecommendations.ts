// 가시성 개요의 "소스 기회"는 지금 원본 집계(도메인/인용 페이지 수/프롬프트
// 수)만 보여준다 — "이 소스를 어떻게 공략해야 하는지"는 LLM이 실측 통계를
// 보고 판단해야 하는 부분이라 API 연동 전까지는 사람이 채운다.
//
// 채우는 방법: 아래 프롬프트(세션에서 별도로 제공)를 실제 수집 통계와 함께
// ChatGPT 등에 물어서 JSON 응답을 받은 뒤, 그 결과를 domain을 키로 여기에
// 그대로 붙여넣으면 가시성 개요 > 소스 기회 탭에 "추천" 컬럼으로 자동
// 반영된다. LLM API가 붙으면 이 파일에 쓰는 자리를 스케줄러가 대신 채우는
// 구조로 그대로 이어받는다.
export interface SourceOpportunityRecommendation {
  recommendation: string;
  reasoning: string;
}

export const sourceOpportunityRecommendations: Record<string, SourceOpportunityRecommendation> = {};
