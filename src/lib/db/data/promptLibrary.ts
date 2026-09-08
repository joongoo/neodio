import { PromptLibraryHealth, PromptLibraryRow } from "../types";

// Matches Figma "Prompt Library Screen (Wireframe)" (node 646:12575, Korean
// page), trimmed to P0 (neodigm_p0_scope.md §2) — this is our own tracked
// prompt list (CRUD), no 3rd-party dependency at all.
//
// Reset to the actual operating prompt set (2026-09 GEO/LLMO 프롬프트셋
// 분석 — 프롬프트 전략 페이지의 st-1~st-14와 동일한 프롬프트). 이전엔
// "완벽한 이메일 캠페인을 설계하는 방법" 같은 임의 예시 문구였는데, 앞으로
// 실제로 LLM에 물어볼 프롬프트로 교체 — 전부 브랜드명을 직접 넣지 않은
// 카테고리 질문(언브랜디드)이라는 게 핵심: "네오다임 알려줘"가 아니라
// "국내 Marketo 구축 업체 추천해줘"처럼 구매 의도가 좁아지는 카테고리
// 질문에서 브랜드가 잡히는지가 진짜 GEO Visibility라는 게 이 세트의 설계
// 원칙 (docs 없음, 채팅 스레드 "GEO/LLMO 프롬프트셋 분석" 참고).
export const promptLibraryByOrg: Record<string, PromptLibraryRow[]> = {
  neodigm: [
    // GSC 실측 노출은 있지만 프롬프트 목록엔 없던 커버리지 공백 (st-1, st-2)
    { id: "pl-1", prompt: "마케팅 자동화 ROI 계산", origin: "manual", category: "마케팅 자동화", subcategory: "GSC 커버리지 공백", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-2", prompt: "이메일 마케팅 자동화 비교", origin: "manual", category: "마케팅 자동화", subcategory: "GSC 커버리지 공백", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    // LLM 브레인스토밍이 식별한 우위/공백 토픽 (st-3~st-5)
    { id: "pl-3", prompt: "HubSpot 온보딩 파트너 후속 토픽", origin: "manual", category: "MarTech 전략", subcategory: "LLM 브레인스토밍", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-4", prompt: "AI 검색 최적화 대행사 추천", origin: "manual", category: "기술적 GEO", subcategory: "LLM 브레인스토밍", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-5", prompt: "B2B CRM 도입 비용 비교", origin: "manual", category: "MarTech 전략", subcategory: "LLM 브레인스토밍", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    // Marketo/AEM 핵심 공략 프롬프트 — 2026-09 ChatGPT(GPT-5.6) 실측으로
    // 5개 전부 Mention/Recommendation/Top Pick 100% 확인됨 (st-6~st-9, st-14)
    { id: "pl-6", prompt: "국내 Adobe Marketo 구축 파트너 추천해줘", origin: "manual", category: "MarTech 전략", subcategory: "Marketo", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-7", prompt: "Adobe Marketo Engage 도입 컨설팅 업체 어디가 좋아?", origin: "manual", category: "MarTech 전략", subcategory: "Marketo", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-8", prompt: "한국에서 Marketo 운영 대행해주는 업체 알려줘", origin: "manual", category: "마케팅 자동화", subcategory: "Marketo", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-9", prompt: "AEM과 Marketo 연동 가능한 구축 업체 추천해줘", origin: "manual", category: "MarTech 전략", subcategory: "AEM", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-10", prompt: "B2B 기업 마케팅 자동화 전문 업체 알려줘", origin: "manual", category: "마케팅 자동화", subcategory: "MarTech", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    // 카테고리 경계(Category Boundary)를 찾기 위한 다음 측정 후보 — 아직
    // 실측 전 (st-10~st-13)
    { id: "pl-11", prompt: "국내 GEO(생성형 AI 검색 최적화) 컨설팅 업체 추천해줘", origin: "manual", category: "기술적 GEO", subcategory: "GEO", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-12", prompt: "우리 회사가 B2B IT 회사인데 마케팅 자동화를 도입하려고 해. 국내에서 구축부터 운영까지 맡길 수 있는 업체 5곳 추천해줘.", origin: "manual", category: "마케팅 자동화", subcategory: "구매자 관점 질문", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-13", prompt: "B2B 기업에서 리드 너처링을 자동화하려면 어떤 업체에 맡겨야 해?", origin: "manual", category: "마케팅 자동화", subcategory: "구매자 관점 질문", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
    { id: "pl-14", prompt: "국내 B2B 마케팅 자동화 업체 5곳을 구축 경험, Adobe 전문성, 운영 지원 기준으로 비교해줘", origin: "manual", category: "MarTech 전략", subcategory: "비교", lastModifiedAt: "2026-09-08", lastModifiedBy: "나" },
  ],
};

export const promptLibraryHealthByOrg: Record<string, PromptLibraryHealth> = {
  neodigm: {
    // 14개 전부 브랜드명 없는 카테고리 질문(언브랜디드)이라 0% — 목표(30%
    // 이하)를 만족한다. 의도적으로 "네오다임 알려줘" 유형을 배제하고 구성함.
    brandedRatio: 0,
    brandedTarget: 30,
    topicIntentMatchCount: 14,
    topicIntentTotal: 14,
  },
};
