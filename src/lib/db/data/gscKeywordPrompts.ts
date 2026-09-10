// GSC 실측 커버리지 공백 키워드(getRealGscCoverageGaps가 찾아낸 검색어)를
// 키로, 그 키워드를 바탕으로 LLM에 직접 물어봐서 받은 실제 프롬프트 문장을
// 값으로 채운다. 여기 채워진 키워드는 프롬프트 전략 화면에서 해당 키워드
// 그룹의 하위 프롬프트로 바로 표시된다.
//
// 실제 값은 더 이상 이 파일이 아니라 `.tmp/llm-bridge/gsc-keyword-prompts.json`
// (backend/llmBridgeStore.ts)에 저장된다 — 프롬프트 전략 화면의 "DB 등록"
// 버튼(LlmBridgeModal)으로 사람이 채운다. LLM API가 붙으면 그 저장소를
// 스케줄러가 대신 채우는 구조로 그대로 이어받는다.
export {};
