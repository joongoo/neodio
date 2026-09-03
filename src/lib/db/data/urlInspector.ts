import { UrlInspectorData } from "../types";

// Matches Figma "URL Inspector Screen (Wireframe)" (node 646:13630),
// trimmed to P0 (neodigm_p0_scope.md §2) — everything here is derived from
// our own citations pipeline. The "인용 시도"/"LLM 레퍼럴 유입 수" charts and
// the "도메인 강도" column are dropped (CDN logs / referral analytics /
// domain-authority index — none of which we have).
export const urlInspectorByOrg: Record<string, UrlInspectorData> = {
  neodigm: {
    ownCitedPrompts: 57,
    totalCitedPrompts: 180,
    uniqueCitedUrls: 41,
    totalCitations: 421,
    ownUrls: [
      { id: "own-1", url: "blog.neodigm.com/b2b-marketing-automation-comparison", citations: 41, citedPrompts: 12, contentVisibility: 82, category: "마케팅", market: "KR" },
      { id: "own-2", url: "blog.neodigm.com/hubspot-onboarding-guide", citations: 28, citedPrompts: 9, contentVisibility: 74, category: "브랜드", market: "KR" },
      { id: "own-3", url: "neodigm.com/solutions/martech-architecture", citations: 15, citedPrompts: 5, contentVisibility: 66, category: "브랜드", market: "GLOBAL" },
      { id: "own-4", url: "blog.neodigm.com/naver-ai-search-visibility", citations: 11, citedPrompts: 4, contentVisibility: 71, category: "마케팅", market: "KR" },
    ],
    thirdPartyUrls: [
      { id: "tp-1", url: "cafe.naver.com/ticketsuccess/386", contentType: "커뮤니티", citations: 47, citedPrompts: 18, category: "마케팅", market: "KR" },
      { id: "tp-2", url: "blog.naver.com/dhel751/224364761907", contentType: "블로그", citations: 33, citedPrompts: 14, category: "여행", market: "KR" },
      { id: "tp-3", url: "www.i-boss.co.kr/ab-6141-68846", contentType: "커뮤니티", citations: 19, citedPrompts: 8, category: "마케팅", market: "KR" },
      { id: "tp-4", url: "www.rinda.ai/alternatives/hubspot", contentType: "제품 페이지", citations: 15, citedPrompts: 6, category: "브랜드", market: "GLOBAL" },
      { id: "tp-5", url: "disquiet.io/articles/NqsAz5", contentType: "블로그", citations: 8, citedPrompts: 3, category: "마케팅", market: "KR" },
    ],
    citedDomains: [
      { id: "cd-1", domain: "cafe.naver.com", citations: 47, uniqueUrls: 31, citationsPerUrl: 1.5, citedPrompts: 18, contentType: "커뮤니티" },
      { id: "cd-2", domain: "blog.naver.com", citations: 33, uniqueUrls: 18, citationsPerUrl: 1.8, citedPrompts: 14, contentType: "블로그" },
      { id: "cd-3", domain: "blog.neodigm.com", citations: 80, uniqueUrls: 12, citationsPerUrl: 6.7, citedPrompts: 25, contentType: "자사" },
      { id: "cd-4", domain: "www.i-boss.co.kr", citations: 19, uniqueUrls: 9, citationsPerUrl: 2.1, citedPrompts: 8, contentType: "커뮤니티" },
      { id: "cd-5", domain: "www.rinda.ai", citations: 15, uniqueUrls: 6, citationsPerUrl: 2.5, citedPrompts: 6, contentType: "제품 페이지" },
      { id: "cd-6", domain: "disquiet.io", citations: 8, uniqueUrls: 4, citationsPerUrl: 2.0, citedPrompts: 3, contentType: "블로그" },
    ],
  },
};
