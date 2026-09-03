import { PromptStrategyData } from "../types";

// Matches Figma "Prompt Strategy" (doc §5), trimmed to P0 (neodigm_p0_scope.md
// §2) — sources are GSC (real search performance on our own property) and a
// weekly LLM insight-brainstorm batch seeded with current mentions/citations.
// Semrush and synthetic personas (the original design's other two sources)
// are dropped. This is mock in this exact shape until the real GSC OAuth
// connection and the weekly brainstorm batch job both exist.
export const promptStrategyByOrg: Record<string, PromptStrategyData> = {
  neodigm: {
    suggestions: [
      {
        id: "sug-1",
        tag: "coverage_gap",
        source: "gsc",
        title: "\"마케팅 자동화 ROI 계산\" 커버리지 공백",
        summary: "GSC에서 노출은 발생하지만 우리 프롬프트 목록에 없는 검색어입니다. 관련 프롬프트를 추가하면 AI 답변 노출을 넓힐 수 있어요.",
        stat: "GSC 노출 1,204회 · 클릭 31회",
      },
      {
        id: "sug-2",
        tag: "strength",
        source: "llm_brainstorm",
        title: "\"HubSpot 온보딩 파트너\" 우위 토픽",
        summary: "이번 주 브레인스토밍에서 우리 브랜드가 경쟁사 대비 가장 자주 언급된 토픽으로 식별됐습니다. 관련 프롬프트를 더 추적하면 우위를 굳힐 수 있어요.",
        stat: "브레인스토밍 생성 하위 토픽 6개",
      },
      {
        id: "sug-3",
        tag: "coverage_gap",
        source: "llm_brainstorm",
        title: "\"AI 검색 최적화 대행\" 커버리지 공백",
        summary: "현재 mentions/citations 데이터를 기반으로 브레인스토밍한 결과, 아직 우리 브랜드가 전혀 언급되지 않는 인접 토픽으로 식별됐습니다.",
        stat: "브레인스토밍 생성 하위 토픽 4개",
      },
    ],
    topics: [
      {
        id: "st-1",
        topic: "마케팅 자동화 ROI 계산",
        market: "KR",
        source: "gsc",
        gscImpressions: 1204,
        brandMentions: [
          { brand: "Neodigm", mentions: 0, isOwnBrand: true },
          { brand: "HubSpot", mentions: 4, isOwnBrand: false },
          { brand: "Salesforce", mentions: 3, isOwnBrand: false },
        ],
      },
      {
        id: "st-2",
        topic: "이메일 마케팅 자동화 비교",
        market: "KR",
        source: "gsc",
        gscImpressions: 861,
        brandMentions: [
          { brand: "Neodigm", mentions: 1, isOwnBrand: true },
          { brand: "HubSpot", mentions: 5, isOwnBrand: false },
        ],
      },
      {
        id: "st-3",
        topic: "HubSpot 온보딩 파트너 후속 토픽",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [
          { brand: "Neodigm", mentions: 12, isOwnBrand: true },
          { brand: "HubSpot", mentions: 8, isOwnBrand: false },
          { brand: "세일즈맵", mentions: 3, isOwnBrand: false },
        ],
      },
      {
        id: "st-4",
        topic: "AI 검색 최적화 대행사 추천",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [
          { brand: "Neodigm", mentions: 0, isOwnBrand: true },
          { brand: "Rinda AI", mentions: 2, isOwnBrand: false },
        ],
      },
      {
        id: "st-5",
        topic: "B2B CRM 도입 비용 비교",
        market: "GLOBAL",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [
          { brand: "Neodigm", mentions: 0, isOwnBrand: true },
          { brand: "Salesforce", mentions: 6, isOwnBrand: false },
          { brand: "Adobe Marketo Engage", mentions: 2, isOwnBrand: false },
        ],
      },
    ],
  },
};
