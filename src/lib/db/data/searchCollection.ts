import { SearchCollectionResult } from "../types";

// Seeded for two keywords: the topic keyword shared with promptResearch.ts
// ("마케팅 자동화") and the brand's own name ("네오다임"), since a
// brand-name query surfaces very different blocks (owned site, news,
// review sites) than a topic query. Other keywords fall back to the empty
// state until a real collection pipeline exists (see project_naver_p0
// memory — naver_search_results table). `collectedAt` marks which
// collection run produced each row, since a real crawl re-runs per keyword
// on its own schedule rather than all at once.
export const searchCollectionByKeyword: Record<string, SearchCollectionResult> = {
  "마케팅 자동화": {
    keyword: "마케팅 자동화",
    stats: {
      collectedBlocks: 18,
      rankedUrls: 20,
      ownBrandRanks: 4,
      competitorRanks: 9,
    },
    naver: [
      { id: "nv-1", rank: 1, blockType: "블로그", title: "마케팅 자동화 툴 비교 총정리 (2026)", url: "blog.naver.com/marketing_kr/1234", snippet: "국내외 마케팅 자동화 솔루션 6종을 가격/기능 기준으로 비교했습니다.", isOwnBrand: false, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-2", rank: 2, blockType: "파워링크", title: "네오다임 - B2B 마케팅 자동화 플랫폼", url: "ad.naver.com/neodigm", snippet: "리드 스코어링부터 이메일 자동화까지, 무료로 체험해보세요.", isOwnBrand: true, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-3", rank: 3, blockType: "카페", title: "마케팅 자동화 도입 후기 공유해요", url: "cafe.naver.com/marketers/5678", snippet: "저희 팀은 네오다임 도입 후 리드 전환율이 올랐어요.", isOwnBrand: true, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-4", rank: 4, blockType: "블로그", title: "HubSpot vs Salesforce, 어떤 걸 골라야 할까", url: "blog.naver.com/cmo_diary/910", snippet: "두 솔루션의 온보딩 난이도와 가격 정책을 비교합니다.", isOwnBrand: false, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-5", rank: 5, blockType: "쇼핑", title: "마케팅 자동화 실무 가이드북", url: "shopping.naver.com/book/2233", snippet: "실무자가 쓴 마케팅 자동화 도입 가이드북.", isOwnBrand: false, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-6", rank: 6, blockType: "지식iN", title: "마케팅 자동화 툴 추천 좀 해주세요", url: "kin.naver.com/qna/8842", snippet: "예산 500만원 이하로 도입 가능한 툴이 궁금합니다.", isOwnBrand: false, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-7", rank: 7, blockType: "블로그", title: "네오다임 도입 사례: 매출 30% 증가", url: "blog.naver.com/neodigm_official/44", snippet: "B2B 스타트업의 네오다임 도입 3개월 후 성과 리포트.", isOwnBrand: true, collectedAt: "2026-09-08T09:12:03+09:00" },
      { id: "nv-8", rank: 8, blockType: "카페", title: "이메일 마케팅 자동화 세팅 질문", url: "cafe.naver.com/startupceo/771", snippet: "Salesforce 마케팅 클라우드 세팅 관련 질문입니다.", isOwnBrand: false, collectedAt: "2026-09-08T09:12:03+09:00" },
    ],
    google: [
      { id: "gg-1", rank: 1, title: "Best Marketing Automation Software 2026", url: "www.g2.com/categories/marketing-automation", snippet: "Compare the top marketing automation platforms by rating and price.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:14:47+09:00" },
      { id: "gg-2", rank: 2, title: "AI Overview", url: "google.com/ai-overview", snippet: "마케팅 자동화 플랫폼은 이메일, 리드 스코어링, CRM 연동 기능을 제공하며 네오다임, HubSpot, Salesforce가 주요 사례로 언급됩니다.", isAiOverview: true, isOwnBrand: true, collectedAt: "2026-09-08T09:14:47+09:00" },
      { id: "gg-3", rank: 3, title: "네오다임 — B2B Marketing Automation", url: "www.neodigm.com", snippet: "Automate lead scoring, email nurturing, and CRM sync in one platform.", isAiOverview: false, isOwnBrand: true, collectedAt: "2026-09-08T09:14:47+09:00" },
      { id: "gg-4", rank: 4, title: "HubSpot Marketing Hub", url: "www.hubspot.com/products/marketing", snippet: "All-in-one marketing software to help you grow traffic and convert leads.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:14:47+09:00" },
      { id: "gg-5", rank: 5, title: "마케팅 자동화란? 개념과 도입 전략", url: "www.i-boss.co.kr/ab-1029", snippet: "마케팅 자동화의 기본 개념과 국내 기업 도입 전략을 소개합니다.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:14:47+09:00" },
      { id: "gg-6", rank: 6, title: "Salesforce Marketing Cloud", url: "www.salesforce.com/products/marketing-cloud", snippet: "Deliver personalized marketing at scale across every channel.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:14:47+09:00" },
    ],
  },
  "네오다임": {
    keyword: "네오다임",
    stats: {
      collectedBlocks: 13,
      rankedUrls: 14,
      ownBrandRanks: 8,
      competitorRanks: 2,
    },
    naver: [
      { id: "nv-nd-1", rank: 1, blockType: "블로그", title: "네오다임 공식 블로그 - B2B 마케팅 자동화", url: "blog.naver.com/neodigm_official", snippet: "네오다임의 제품 업데이트와 고객 사례를 공유합니다.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-2", rank: 2, blockType: "파워링크", title: "네오다임 - 지금 무료로 시작하기", url: "ad.naver.com/neodigm", snippet: "리드 스코어링부터 이메일 자동화까지, 14일 무료 체험.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-3", rank: 3, blockType: "카페", title: "네오다임 써보신 분 계신가요?", url: "cafe.naver.com/marketers/6021", snippet: "도입 전인데 실무 후기가 궁금해서 여쭤봅니다.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-4", rank: 4, blockType: "지식iN", title: "네오다임과 HubSpot 중 뭐가 나을까요", url: "kin.naver.com/qna/9012", snippet: "국내 B2B 스타트업 기준으로 비교 부탁드려요.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-5", rank: 5, blockType: "블로그", title: "네오다임 도입기: 3개월 성과 리포트", url: "blog.naver.com/growth_diary/205", snippet: "리드 전환율 22%p 개선, 온보딩 2주 소요.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-6", rank: 6, blockType: "쇼핑", title: "국내 마케팅 자동화 솔루션 비교 리포트(PDF)", url: "shopping.naver.com/book/4410", snippet: "네오다임, HubSpot, Salesforce 등 6개 솔루션 비교.", isOwnBrand: false, collectedAt: "2026-09-08T09:31:22+09:00" },
      { id: "nv-nd-7", rank: 7, blockType: "카페", title: "네오다임 요금제 실제로 어떤가요", url: "cafe.naver.com/startupceo/1188", snippet: "시드 단계 스타트업인데 요금제 부담이 될지 궁금해요.", isOwnBrand: true, collectedAt: "2026-09-08T09:31:22+09:00" },
    ],
    google: [
      { id: "gg-nd-1", rank: 1, title: "네오다임 | B2B Marketing Automation", url: "www.neodigm.com", snippet: "Automate lead scoring, email nurturing, and CRM sync in one platform.", isAiOverview: false, isOwnBrand: true, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-2", rank: 2, title: "AI Overview", url: "google.com/ai-overview", snippet: "네오다임은 한국의 B2B 마케팅 자동화 플랫폼으로, 리드 스코어링과 이메일 자동화 기능을 제공합니다.", isAiOverview: true, isOwnBrand: true, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-3", rank: 3, title: "네오다임 리뷰 - G2", url: "www.g2.com/products/neodigm/reviews", snippet: "4.6/5 (32 reviews). \"온보딩이 빠르고 지원팀 응답이 좋다.\"", isAiOverview: false, isOwnBrand: true, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-4", rank: 4, title: "네오다임, 시리즈 A 투자 유치 - 스타트업 뉴스", url: "news.startuptimes.kr/2026/neodigm-series-a", snippet: "B2B 마케팅 자동화 스타트업 네오다임이 80억 규모 투자를 유치했다.", isAiOverview: false, isOwnBrand: true, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-5", rank: 5, title: "네오다임 vs HubSpot: 국내 기업 비교 가이드", url: "www.i-boss.co.kr/ab-2044", snippet: "가격, 온보딩, 한국어 지원 측면에서 두 솔루션을 비교합니다.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-6", rank: 6, title: "네오다임 채용 - LinkedIn", url: "www.linkedin.com/company/neodigm/jobs", snippet: "네오다임에서 함께할 팀원을 찾고 있습니다.", isAiOverview: false, isOwnBrand: true, collectedAt: "2026-09-08T09:33:09+09:00" },
      { id: "gg-nd-7", rank: 7, title: "Salesforce Marketing Cloud", url: "www.salesforce.com/products/marketing-cloud", snippet: "Deliver personalized marketing at scale across every channel.", isAiOverview: false, isOwnBrand: false, collectedAt: "2026-09-08T09:33:09+09:00" },
    ],
  },
};
