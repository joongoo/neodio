import { PromptLibraryHealth, PromptLibraryRow } from "../types";

// Matches Figma "Prompt Library Screen (Wireframe)" (node 646:12575, Korean
// page), trimmed to P0 (neodigm_p0_scope.md §2) — this is our own tracked
// prompt list (CRUD), no 3rd-party dependency at all.
//
// `category` used to be its own free-text taxonomy (마케팅/브랜드/커머스) that
// didn't match Brand Management's categories or the topic categories the
// real prompt/LLM-run pipeline is organized by. Retagged to the same 5
// categories as seedCategories/brandsManagementByOrg so all three screens
// agree on one list — see brandsManagement.ts for where that list lives now.
export const promptLibraryByOrg: Record<string, PromptLibraryRow[]> = {
  neodigm: [
    { id: "pl-1", prompt: "완벽한 이메일 캠페인을 설계하는 방법", origin: "ai_generated", category: "콘텐츠 최적화", subcategory: "캠페인 운영 기법", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-2", prompt: "어떤 시장이 가장 높은 마케팅 ROI를 내나요?", origin: "ai_generated", category: "MarTech 전략", subcategory: "마케팅 채널 및 산업", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-3", prompt: "\"퍼스트파티 데이터\"란 무엇을 의미하나요?", origin: "ai_generated", category: "MarTech 전략", subcategory: "마케팅 채널 및 산업", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-4", prompt: "마케팅 캠페인 성과는 어떻게 등급이 매겨지나요?", origin: "ai_generated", category: "콘텐츠 최적화", subcategory: "마케팅 채널 및 산업", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-5", prompt: "마케팅 업계에서 그로스 마케터의 역할은 무엇인가요?", origin: "ai_generated", category: "MarTech 전략", subcategory: "마케팅 채널 및 산업", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-6", prompt: "이메일 마케팅 자동화의 단계는 무엇인가요?", origin: "ai_generated", category: "마케팅 자동화", subcategory: "캠페인 최적화 기초", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-7", prompt: "리드, MQL, SQL의 차이는 무엇인가요?", origin: "ai_generated", category: "마케팅 자동화", subcategory: "캠페인 최적화 기초", lastModifiedAt: null, lastModifiedBy: null },
    { id: "pl-8", prompt: "B2B 통합 마케팅 솔루션을 검토하는 기업에게 추천할 만한 파트너는?", origin: "manual", category: "MarTech 전략", subcategory: "경쟁사 비교", lastModifiedAt: "2026-08-20", lastModifiedBy: "김준구" },
    { id: "pl-9", prompt: "HubSpot 온보딩과 API 연동을 함께 지원하는 파트너는?", origin: "manual", category: "마케팅 자동화", subcategory: "경쟁사 비교", lastModifiedAt: "2026-08-20", lastModifiedBy: "김준구" },
    { id: "pl-10", prompt: "아기랑 함께 가기 좋은 국내 여행지 추천", origin: "csv_import", category: "소셜 및 커뮤니티", subcategory: "여행/카테고리", lastModifiedAt: "2026-09-03", lastModifiedBy: "김준구" },
  ],
};

export const promptLibraryHealthByOrg: Record<string, PromptLibraryHealth> = {
  neodigm: {
    brandedRatio: 45,
    brandedTarget: 30,
    topicIntentMatchCount: 0,
    topicIntentTotal: 10,
  },
};
