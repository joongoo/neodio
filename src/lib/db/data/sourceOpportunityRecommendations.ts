// 가시성 개요의 "소스 기회"는 원본 집계(도메인/인용 페이지 수/프롬프트 수)만
// 보여준다 — "이 소스를 어떻게 공략해야 하는지"는 LLM 판단이 필요한 부분이라
// API 연동 전까지는 화면의 "DB 등록" 버튼(LlmBridgeModal)으로 사람이 채운다.
// 실제 값은 더 이상 이 파일이 아니라 `.tmp/llm-bridge/source-recommendation.json`
// (backend/llmBridgeStore.ts)에 저장된다 — API가 붙으면 그 저장소를 스케줄러가
// 대신 채우는 구조로 그대로 이어받는다.
export interface SourceOpportunityRecommendation {
  recommendation: string;
  reasoning: string;
}
