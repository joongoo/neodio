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
      // 2026-09 GEO/LLMO 프롬프트셋 분석(실 콘텐츠 기반) — 네오다임 홈페이지가
      // 실제로 내세우는 포지션(Adobe Marketo Engage 공식 인증 파트너, AEM 연계
      // 구축 사례)을 근거로, 브랜드명을 직접 묻는 질문보다 "업체 추천" 카테고리
      // 질문에서 우리 브랜드가 잡히는지가 진짜 GEO Visibility라는 분석.
      {
        id: "sug-4",
        tag: "strength",
        source: "llm_brainstorm",
        title: "\"AEM+Marketo 연동 업체 추천\" 핵심 공략 프롬프트",
        summary:
          "네오다임이 공개 사례로 AEM 웹사이트와 Marketo 연동(방문자 행동 데이터를 Marketo 리드 프로파일과 연계)을 소개하고 있어, 이 조합을 묻는 질문에 대한 근거가 명확합니다. 초기 GEO 테스트셋의 핵심 프롬프트로 우선순위를 두는 것을 제안합니다.",
        stat: "Adobe 공식 인증 파트너 + AEM 연동 공개 사례 보유",
      },
      {
        id: "sug-5",
        tag: "coverage_gap",
        source: "llm_brainstorm",
        title: "\"국내 Marketo 구축/운영 대행\" 카테고리 공백",
        summary:
          "\"네오다임 알려줘\"처럼 브랜드명을 직접 묻는 질문에서 노출되는 건 당연합니다. 진짜 중요한 건 \"국내 Marketo 구축 업체 추천해줘\" 같은 카테고리(업체 추천) 질문에서 잡히는지입니다 — 공략 순서는 Marketo → B2B 마케팅 자동화 → Adobe MarTech → AEM+Marketo → GEO/SEO 제안.",
        stat: "우선순위 카테고리 5개 (Marketo/MarTech/Adobe/AEM/GEO)",
      },
      {
        id: "sug-6",
        tag: "coverage_gap",
        source: "llm_brainstorm",
        title: "구매자 관점 자연어 질문으로 전환 필요",
        summary:
          "\"마케팅 자동화 업체 추천해줘\"보다 \"우리 회사가 B2B IT 회사인데 마케팅 자동화를 도입하려고 해. 국내에서 구축부터 운영까지 맡길 수 있는 업체 5곳 추천해줘\"처럼 실제 구매자가 할 법한 문장이 LLM 답변에서 브랜드가 언급될 가능성이 더 높습니다. 브랜드 검색이 아닌 카테고리 검색이라 LLMO 관점에서 가치가 큽니다.",
        stat: "자연어 구매자 질문 7개 제안",
      },
      {
        id: "sug-7",
        tag: "strength",
        source: "llm_brainstorm",
        title: "네오다임의 카테고리 경계(Category Boundary) 발견",
        summary:
          "ChatGPT(GPT-5.6)로 Marketo 관련 5개 고의도 프롬프트를 실측한 결과 Mention·Recommendation·Top Pick 전부 100%였습니다. 반면 \"마케팅 자동화 도입 시 고려사항\", \"국내 B2B 마케팅 자동화 플랫폼\"처럼 넓은 토픽에서는 0%였습니다 — 네오다임은 넓은 토픽보다 \"Marketo + 국내 + 구축/운영/파트너\"처럼 구매 의도가 좁아질수록 강하게 등장합니다. 다음 측정은 이 5개보다 한 단계 넓은 질문(국내 B2B MarTech 에이전시 → Adobe 파트너 → 디지털 마케팅 에이전시 → GEO 컨설팅)으로 내려가며 경계선을 찾는 것을 제안합니다.",
        stat: "고의도 프롬프트 5/5 100% · 광의 토픽 0%",
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
      // 아래 st-6~st-14는 2026-09 GEO/LLMO 프롬프트셋 분석(sug-4~sug-6)에서
      // 나온 공략 후보 질문들이다.
      //
      // st-6~st-9, st-14는 실제 ChatGPT(GPT-5.6) 측정 결과로 채움 (신규
      // 세션·메모리 배제·웹 검색 없음·네오다임 의도적 포함/배제 없음 조건).
      // brandMentions는 GPT가 스스로 보고한 "언급된 브랜드" 목록을 존재
      // 유무(1)로 반영한 것 — 답변 내 정확한 등장 횟수는 아니다. 5개 전부
      // 네오다임 Mention/Recommendation/Top Pick 100%.
      //
      // st-10~st-13은 아직 측정 전이라 gscImpressions는 null, Neodigm
      // mentions는 0 — "언급 안 됨"이 아니라 "아직 안 재봄"이라는 뜻이다.
      // 다음 측정 후보(같은 분석에서 제안된 "카테고리 경계 찾기" 순서):
      // 국내 B2B MarTech 전문 에이전시 추천 → 국내 Adobe 마케팅 솔루션
      // 파트너 → B2B 디지털 마케팅 에이전시 → 생성형 AI 검색 최적화 업체 →
      // 국내 GEO 컨설팅 업체. 실제로 측정되면 그 값으로 교체해야 한다.
      {
        id: "st-6",
        topic: "국내 Adobe Marketo 구축 파트너 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-7",
        topic: "Adobe Marketo Engage 도입 컨설팅 업체 어디가 좋아?",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-8",
        topic: "AEM과 Marketo 연동 가능한 구축 업체 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-9",
        topic: "B2B 기업 마케팅 자동화 전문 업체 알려줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [
          { brand: "Neodigm", mentions: 1, isOwnBrand: true },
          { brand: "HubSpot", mentions: 1, isOwnBrand: false },
          { brand: "Adobe Marketo Engage", mentions: 1, isOwnBrand: false },
          { brand: "Salesforce Marketing Cloud Account Engagement", mentions: 1, isOwnBrand: false },
        ],
      },
      {
        id: "st-14",
        topic: "한국에서 Marketo 운영 대행해주는 업체 알려줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-10",
        topic: "국내 GEO(생성형 AI 검색 최적화) 컨설팅 업체 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-11",
        topic: "우리 회사가 B2B IT 회사인데 마케팅 자동화를 도입하려고 해. 국내에서 구축부터 운영까지 맡길 수 있는 업체 5곳 추천해줘.",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-12",
        topic: "B2B 기업에서 리드 너처링을 자동화하려면 어떤 업체에 맡겨야 해?",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-13",
        topic: "국내 B2B 마케팅 자동화 업체 5곳을 구축 경험, Adobe 전문성, 운영 지원 기준으로 비교해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
    ],
  },
};
