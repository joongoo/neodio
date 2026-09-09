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
      // Citation Attempt: 이미 만들어둔 콘텐츠가 실제로 AI 답변의 출처로
      // 인용되는지 테스트하는 프롬프트. 실제 GSC "내 콘텐츠" 상위 페이지
      // (2026-09 사용자 제공 실측: 노출은 높은데 클릭은 낮은 페이지가
      // "인용 잠재력은 있는데 실제로는 잘 안 읽히는" 콘텐츠라 우선 타겟)를
      // 그대로 사용한다 — getRealGscTopPages가 연동되면 이 두 항목을
      // 자동으로 대체/확장할 수 있다.
      {
        id: "sug-8",
        tag: "coverage_gap",
        source: "citation_attempt",
        title: "\"디맨드젠 vs 리드젠\" 콘텐츠 인용 테스트",
        summary:
          "GSC 실측: 노출 1,122회 대비 클릭 9회로 노출 대비 클릭이 낮은 페이지입니다. AI 답변에서 출처로 인용되는지 확인하는 프롬프트입니다. Targeting URL: https://www.neodigm.com/news/?bmode=view&idx=166846352",
        stat: "GSC 노출 1,122회 · 클릭 9회 · 인용 테스트 프롬프트 3개",
      },
      {
        id: "sug-9",
        tag: "coverage_gap",
        source: "citation_attempt",
        title: "\"Databricks CIO Forum 사례\" 콘텐츠 인용 테스트",
        summary:
          "GSC 실측: 클릭 5회 · 노출 31회의 케이스 스터디 페이지입니다. AI 답변에서 출처로 인용되는지 확인하는 프롬프트입니다. Targeting URL: https://www.neodigm.com/case_study_experiential/?bmode=view&idx=153076609",
        stat: "GSC 클릭 5회 · 노출 31회 · 인용 테스트 프롬프트 3개",
      },
    ],
    topics: [
      {
        id: "st-1",
        groupId: "sug-1",
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
        groupId: "sug-1",
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
        groupId: "sug-2",
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
        groupId: "sug-3",
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
        groupId: "sug-4",
        topic: "국내 Adobe Marketo 구축 파트너 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-7",
        groupId: "sug-4",
        topic: "Adobe Marketo Engage 도입 컨설팅 업체 어디가 좋아?",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-8",
        groupId: "sug-4",
        topic: "AEM과 Marketo 연동 가능한 구축 업체 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-9",
        groupId: "sug-4",
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
        groupId: "sug-4",
        topic: "한국에서 Marketo 운영 대행해주는 업체 알려줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 1, isOwnBrand: true }],
      },
      {
        id: "st-10",
        groupId: "sug-5",
        topic: "국내 GEO(생성형 AI 검색 최적화) 컨설팅 업체 추천해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-11",
        groupId: "sug-6",
        topic: "우리 회사가 B2B IT 회사인데 마케팅 자동화를 도입하려고 해. 국내에서 구축부터 운영까지 맡길 수 있는 업체 5곳 추천해줘.",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-12",
        groupId: "sug-6",
        topic: "B2B 기업에서 리드 너처링을 자동화하려면 어떤 업체에 맡겨야 해?",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      {
        id: "st-13",
        groupId: "sug-5",
        topic: "국내 B2B 마케팅 자동화 업체 5곳을 구축 경험, Adobe 전문성, 운영 지원 기준으로 비교해줘",
        market: "KR",
        source: "llm_brainstorm",
        gscImpressions: null,
        brandMentions: [{ brand: "Neodigm", mentions: 0, isOwnBrand: true }],
      },
      // Citation Attempt: 2026-09 사용자가 GSC "내 콘텐츠"에서 직접 캡처해
      // 준 실제 상위 페이지 2개를 타겟으로 잡는다 — 노출 대비 클릭이 낮아
      // "인용 잠재력은 있는데 실제로는 잘 안 읽히는" 콘텐츠 우선순위.
      // st-15~17: /news/166846352 "B2B 마케터를 위한 '진짜 리드'를 얻는
      // 방법: 디맨드젠 vs 리드젠" — GSC 코버리지 공백 키워드 "리드젠"(sug-1
      // 그룹, 노출 342회)과 주제가 정확히 겹친다.
      {
        id: "st-15",
        groupId: "sug-8",
        topic: "디맨드젠과 리드젠은 어떻게 다른가요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "정보 탐색",
        branded: false,
        reasoning: "/news/166846352 인용 테스트 — 글의 핵심 주제(디맨드젠 vs 리드젠)를 그대로 묻는 정보 탐색형 질문",
      },
      {
        id: "st-16",
        groupId: "sug-8",
        topic: "B2B 마케팅에서 '진짜 리드'를 얻으려면 어떤 방법이 효과적인가요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "정보 탐색",
        branded: false,
        reasoning: "/news/166846352 인용 테스트 — 글 제목의 표현('진짜 리드')을 그대로 쓰는 질문",
      },
      {
        id: "st-17",
        groupId: "sug-8",
        topic: "리드의 질을 높이려면 디맨드젠과 리드젠 전략을 어떻게 병행해야 하나요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "도입 검토",
        branded: false,
        reasoning: "/news/166846352 인용 테스트 — 두 전략의 병행을 묻는 도입 검토형 질문",
      },
      // st-18~20: /case_study_experiential/153076609 "Databricks CIO Forum
      // 2024" 사례 페이지.
      {
        id: "st-18",
        groupId: "sug-9",
        topic: "대기업 대상 CIO 포럼 같은 B2B 이벤트 마케팅은 어떻게 기획하나요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "정보 탐색",
        branded: false,
        reasoning: "/case_study_experiential/153076609 인용 테스트 — 이벤트 기획 방법을 묻는 정보 탐색형 질문",
      },
      {
        id: "st-19",
        groupId: "sug-9",
        topic: "테크 기업이 CIO 대상 오프라인 포럼을 성공적으로 운영한 사례가 있나요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "업체 비교",
        branded: false,
        reasoning: "/case_study_experiential/153076609 인용 테스트 — 실제 사례를 찾는 비교형 질문",
      },
      {
        id: "st-20",
        groupId: "sug-9",
        topic: "대기업 고객 대상 경험 마케팅은 어떤 효과가 있나요?",
        market: "KR",
        source: "citation_attempt",
        gscImpressions: null,
        brandMentions: [],
        intent: "도입 검토",
        branded: false,
        reasoning: "/case_study_experiential/153076609 인용 테스트 — 도입 효과를 묻는 도입 검토형 질문",
      },
    ],
  },
};
