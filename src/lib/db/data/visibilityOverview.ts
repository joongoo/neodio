import { RankedRow, TopicCategory, TopicRow } from "../types";

// Confirmed labels/counts from Figma "Table Section" tabs (node 646:11691).
export const topicCategoriesByOrg: Record<string, TopicCategory[]> = {
  neodigm: [
    { id: "top-prompts", label: "성과가 좋은 프롬프트 및 토픽", badge: 18 },
    { id: "topic-opportunities", label: "토픽 기회", badge: 13 },
    { id: "latest-top-brands", label: "최신 상위 브랜드", badge: 18 },
    { id: "cited-pages", label: "인용된 페이지", badge: 18 },
    { id: "cited-sources", label: "인용된 소스", badge: 7 },
    { id: "source-opportunities", label: "소스 기회", badge: 10 },
  ],
};

// Mentions-by-model / mentions-by-market ranked lists (node 646:11620 / 646:11657).
export const mentionsByModelByOrg: Record<string, Record<string, RankedRow[]>> = {
  neodigm: {
    mentions: [
      { label: "ChatGPT", value: 218, display: "218 (23%)" },
      { label: "Gemini", value: 174, display: "174 (18%)" },
      { label: "Claude", value: 151, display: "151 (16%)" },
      { label: "Perplexity", value: 146, display: "146 (15%)" },
      { label: "Naver AI검색", value: 132, display: "132 (14%)" },
      { label: "Google AI Overview", value: 127, display: "127 (13%)" },
    ],
    visibility: [
      { label: "ChatGPT", value: 68, display: "68%" },
      { label: "Gemini", value: 63, display: "63%" },
      { label: "Claude", value: 61, display: "61%" },
      { label: "Perplexity", value: 59, display: "59%" },
      { label: "Naver AI검색", value: 55, display: "55%" },
      { label: "Google AI Overview", value: 53, display: "53%" },
    ],
    exposure: [
      { label: "ChatGPT", value: 1220, display: "1.2K" },
      { label: "Gemini", value: 980, display: "980" },
      { label: "Claude", value: 760, display: "760" },
      { label: "Perplexity", value: 704, display: "704" },
      { label: "Naver AI검색", value: 612, display: "612" },
      { label: "Google AI Overview", value: 598, display: "598" },
    ],
  },
};

export const mentionsByMarketByOrg: Record<string, Record<string, RankedRow[]>> = {
  neodigm: {
    mentions: [
      { label: "한국 (KR)", value: 411, display: "411 (44%)" },
      { label: "미국 (US)", value: 286, display: "286 (31%)" },
      { label: "전세계", value: 146, display: "146 (16%)" },
      { label: "영국 (GB)", value: 57, display: "57 (6%)" },
      { label: "독일 (DE)", value: 48, display: "48 (5%)" },
    ],
    visibility: [
      { label: "한국 (KR)", value: 66, display: "66%" },
      { label: "미국 (US)", value: 61, display: "61%" },
      { label: "전세계", value: 58, display: "58%" },
      { label: "영국 (GB)", value: 46, display: "46%" },
      { label: "독일 (DE)", value: 42, display: "42%" },
    ],
    exposure: [
      { label: "한국 (KR)", value: 1540, display: "1.5K" },
      { label: "미국 (US)", value: 1120, display: "1.1K" },
      { label: "전세계", value: 780, display: "780" },
      { label: "영국 (GB)", value: 340, display: "340" },
      { label: "독일 (DE)", value: 296, display: "296" },
    ],
  },
};

// Topics table (node 646:11702). Only the first category's rows are fleshed
// out with real dummy content — the others reuse the same shape so the
// table/tab pattern is demonstrated end to end; extend per category as
// those screens get built.
export const topicsByOrgAndCategory: Record<string, Record<string, TopicRow[]>> = {
  neodigm: {
    "top-prompts": [
      {
        id: "b2b-integrated-marketing",
        topic: "B2B 통합 마케팅 솔루션",
        searchVolume: 18_200,
        mentions: 171,
        visibility: 66,
        difficulty: 58,
        market: "KR",
        prompts: [
          {
            id: "p1",
            prompt: "B2B 통합 마케팅 솔루션을 검토하는 기업에게 추천할 만한 파트너는?",
            model: "ChatGPT",
            myBrand: "2",
            brand: "5",
            source: "7",
            market: "KR",
          },
        ],
      },
      {
        id: "marketing-automation",
        topic: "마케팅 자동화 구축",
        searchVolume: 22_400,
        mentions: 158,
        visibility: 63,
        difficulty: 54,
        market: "KR",
        prompts: [
          {
            id: "p2",
            prompt: "마케팅 자동화 구축을 위한 HubSpot 파트너를 어떻게 고르면 좋을까?",
            model: "Gemini",
            myBrand: "1",
            brand: "4",
            source: "8",
            market: "KR",
          },
        ],
      },
      {
        id: "hubspot-onboarding",
        topic: "HubSpot 온보딩 파트너",
        searchVolume: 9_700,
        mentions: 132,
        visibility: 59,
        difficulty: 42,
        market: "KR",
        prompts: [
          {
            id: "p3",
            prompt: "한국에서 HubSpot 온보딩과 API 연동을 함께 지원하는 파트너는?",
            model: "Naver AI검색",
            myBrand: "1",
            brand: "4",
            source: "6",
            market: "KR",
          },
        ],
      },
      {
        id: "martech-architecture",
        topic: "MarTech 아키텍처 설계",
        searchVolume: 7_600,
        mentions: 97,
        visibility: 54,
        difficulty: 39,
        market: "GLOBAL",
        prompts: [
          {
            id: "p4",
            prompt: "CRM, ERP, 마케팅 자동화를 연결하는 MarTech 아키텍처 설계사는?",
            model: "Claude",
            myBrand: "1",
            brand: "5",
            source: "5",
            market: "GLOBAL",
          },
        ],
      },
    ],
    "topic-opportunities": [
      {
        id: "ai-search-optimization",
        topic: "AI 검색 최적화",
        searchVolume: 27_300,
        mentions: 64,
        visibility: 31,
        difficulty: 64,
        market: "KR",
        prompts: [
          {
            id: "p5",
            prompt: "AI 검색 결과에서 B2B 마케팅 서비스 회사가 더 잘 인용되려면?",
            model: "Google AI Overview",
            myBrand: "—",
            brand: "3",
            source: "8",
            market: "KR",
          },
        ],
      },
      {
        id: "crm-erp-integration",
        topic: "CRM ERP API 연동",
        searchVolume: 12_900,
        mentions: 71,
        visibility: 36,
        difficulty: 58,
        market: "US",
        prompts: [
          {
            id: "p6",
            prompt: "CRM과 ERP를 HubSpot 중심으로 연동할 때 참고할 파트너는?",
            model: "Perplexity",
            myBrand: "—",
            brand: "4",
            source: "7",
            market: "US",
          },
        ],
      },
    ],
  },
};
