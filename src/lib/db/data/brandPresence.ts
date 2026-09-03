import { BrandPresenceData } from "../types";

const WEEKS = ["8월 2일", "8월 9일", "8월 16일", "8월 23일"];

// Matches Figma "Brand Presence Screen (Wireframe)" (node 646:12952, Korean
// page), trimmed to P0 (neodigm_p0_scope.md §2) — everything here comes
// from our own mentions/citations pipeline, no 3rd-party data.
export const brandPresenceByOrg: Record<string, BrandPresenceData> = {
  neodigm: {
    allCompetitors: ["Neodigm", "HubSpot", "Salesforce", "Rinda AI", "Adobe Marketo Engage", "세일즈맵"],
    defaultSelectedCompetitors: ["Neodigm", "HubSpot", "Salesforce"],
    mentionsByWeek: [
      { week: WEEKS[0], Neodigm: 42, HubSpot: 58, Salesforce: 51, "Rinda AI": 19, "Adobe Marketo Engage": 15, 세일즈맵: 9 },
      { week: WEEKS[1], Neodigm: 47, HubSpot: 55, Salesforce: 49, "Rinda AI": 21, "Adobe Marketo Engage": 16, 세일즈맵: 10 },
      { week: WEEKS[2], Neodigm: 51, HubSpot: 61, Salesforce: 53, "Rinda AI": 24, "Adobe Marketo Engage": 17, 세일즈맵: 11 },
      { week: WEEKS[3], Neodigm: 58, HubSpot: 57, Salesforce: 50, "Rinda AI": 23, "Adobe Marketo Engage": 18, 세일즈맵: 12 },
    ],
    citationsByWeek: [
      { week: WEEKS[0], Neodigm: 21, HubSpot: 34, Salesforce: 29, "Rinda AI": 11, "Adobe Marketo Engage": 9, 세일즈맵: 5 },
      { week: WEEKS[1], Neodigm: 24, HubSpot: 31, Salesforce: 27, "Rinda AI": 12, "Adobe Marketo Engage": 10, 세일즈맵: 6 },
      { week: WEEKS[2], Neodigm: 27, HubSpot: 36, Salesforce: 30, "Rinda AI": 13, "Adobe Marketo Engage": 10, 세일즈맵: 6 },
      { week: WEEKS[3], Neodigm: 30, HubSpot: 33, Salesforce: 28, "Rinda AI": 13, "Adobe Marketo Engage": 11, 세일즈맵: 7 },
    ],
    sentimentByWeek: [
      { week: WEEKS[0], positive: 48, neutral: 39, negative: 13 },
      { week: WEEKS[1], positive: 51, neutral: 37, negative: 12 },
      { week: WEEKS[2], positive: 55, neutral: 34, negative: 11 },
      { week: WEEKS[3], positive: 57, neutral: 33, negative: 10 },
    ],
    promptMetricsByWeek: [
      { week: WEEKS[0], totalPrompts: 180, sentimentDetectedPrompts: 96 },
      { week: WEEKS[1], totalPrompts: 180, sentimentDetectedPrompts: 104 },
      { week: WEEKS[2], totalPrompts: 184, sentimentDetectedPrompts: 118 },
      { week: WEEKS[3], totalPrompts: 184, sentimentDetectedPrompts: 121 },
    ],
    topMovers: [
      { id: "sm-1", prompt: "HubSpot 온보딩 파트너로 어디가 신뢰할 만한가요?", source: "ChatGPT", topic: "HubSpot 온보딩 파트너", category: "브랜드", market: "KR", popularity: 82, fromSentiment: "neutral", toSentiment: "positive" },
      { id: "sm-2", prompt: "B2B 통합 마케팅 솔루션 도입 시 실패 사례가 있나요?", source: "Naver AI검색", topic: "B2B 통합 마케팅 솔루션", category: "브랜드", market: "KR", popularity: 74, fromSentiment: "negative", toSentiment: "neutral" },
      { id: "sm-3", prompt: "마케팅 자동화 구축 파트너 선택 시 고려사항은?", source: "Gemini", topic: "마케팅 자동화 구축", category: "브랜드", market: "KR", popularity: 61, fromSentiment: "negative", toSentiment: "positive" },
    ],
    bottomMovers: [],
    dataInsights: [
      { id: "di-1", topic: "B2B 통합 마케팅 솔루션", source: "ChatGPT", popularity: 92, visibilityScore: 66, mentions: 171, sentiment: "positive", totalCitations: 41, ownCitations: 12 },
      { id: "di-2", topic: "마케팅 자동화 구축", source: "Gemini", popularity: 87, visibilityScore: 63, mentions: 158, sentiment: "positive", totalCitations: 37, ownCitations: 9 },
      { id: "di-3", topic: "HubSpot 온보딩 파트너", source: "Naver AI검색", popularity: 79, visibilityScore: 59, mentions: 132, sentiment: "neutral", totalCitations: 29, ownCitations: 8 },
      { id: "di-4", topic: "MarTech 아키텍처 설계", source: "Claude", popularity: 68, visibilityScore: 54, mentions: 97, sentiment: "positive", totalCitations: 22, ownCitations: 6 },
      { id: "di-5", topic: "AI 검색 최적화", source: "Google AI Overview", popularity: 64, visibilityScore: 31, mentions: 64, sentiment: "neutral", totalCitations: 18, ownCitations: 2 },
      { id: "di-6", topic: "CRM ERP API 연동", source: "Perplexity", popularity: 55, visibilityScore: 36, mentions: 71, sentiment: "neutral", totalCitations: 15, ownCitations: 1 },
    ],
    shareOfVoice: [
      {
        id: "sov-1",
        topic: "B2B 통합 마케팅 솔루션",
        popularity: 92,
        mentions: 171,
        rank: 2,
        sharePercent: 24,
        topBrands: [
          { brand: "HubSpot", share: 32 },
          { brand: "Neodigm", share: 24 },
          { brand: "Salesforce", share: 21 },
          { brand: "Rinda AI", share: 12 },
          { brand: "Adobe Marketo Engage", share: 8 },
        ],
      },
      {
        id: "sov-2",
        topic: "마케팅 자동화 구축",
        popularity: 87,
        mentions: 158,
        rank: 3,
        sharePercent: 19,
        topBrands: [
          { brand: "Salesforce", share: 29 },
          { brand: "HubSpot", share: 27 },
          { brand: "Neodigm", share: 19 },
          { brand: "Adobe Marketo Engage", share: 15 },
          { brand: "Rinda AI", share: 7 },
        ],
      },
      {
        id: "sov-3",
        topic: "HubSpot 온보딩 파트너",
        popularity: 79,
        mentions: 132,
        rank: 2,
        sharePercent: 28,
        topBrands: [
          { brand: "HubSpot", share: 41 },
          { brand: "Neodigm", share: 28 },
          { brand: "세일즈맵", share: 14 },
          { brand: "Salesforce", share: 10 },
          { brand: "Rinda AI", share: 4 },
        ],
      },
    ],
  },
};
