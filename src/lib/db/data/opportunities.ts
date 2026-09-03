import { ContentRecoveryOpportunity, RobotsTxtOpportunity } from "../types";

// Matches Figma "Opportunity Detail - Technical Diagnostic (Template B,
// Merged)" (node 646:14937) — robots.txt is our own site's file, fetched
// directly, no 3rd-party dependency (neodigm_p0_scope.md §2).
export const robotsTxtOpportunityByOrg: Record<string, RobotsTxtOpportunity> = {
  neodigm: {
    title: "robots.txt로 차단된 트래픽",
    description: "사이트의 robots.txt로 차단된 트래픽 분석입니다.",
    summary:
      "robots.txt로 차단된 URL 1개를 발견했으며, 이는 AI 에이전트 3개에 영향을 미쳐 검색엔진 및 AI 크롤러로부터의 잠재적 트래픽 손실을 나타냅니다.",
    totalUrls: 1,
    blockedAgentsCount: 3,
    sitemapUrl: "https://neodigm.com/sitemap-index.xml",
    lines: [
      { lineNumber: 1, text: "User-agent: *", blocksAgent: false },
      { lineNumber: 2, text: "Allow: /", blocksAgent: false },
      { lineNumber: 3, text: "Disallow: /drafts/", blocksAgent: false },
      { lineNumber: 4, text: "Disallow: /enrichment/", blocksAgent: false },
      { lineNumber: 5, text: "Disallow: /tools/", blocksAgent: false },
      { lineNumber: 6, text: "Disallow: /plugins/experimentation/", blocksAgent: false },
      { lineNumber: 7, text: "", blocksAgent: false },
      { lineNumber: 8, text: "User-agent: GPTBot", blocksAgent: false },
      { lineNumber: 9, text: "Disallow: /blog/email-automation-101", blocksAgent: true },
      { lineNumber: 10, text: "User-agent: OAI-SearchBot", blocksAgent: false },
      { lineNumber: 11, text: "Disallow: /blog/email-automation-101", blocksAgent: true },
      { lineNumber: 12, text: "User-agent: OAI-User", blocksAgent: false },
      { lineNumber: 13, text: "Disallow: /blog/email-automation-101", blocksAgent: true },
      { lineNumber: 14, text: "", blocksAgent: false },
      { lineNumber: 15, text: "Sitemap: https://neodigm.com/sitemap-index.xml", blocksAgent: false },
    ],
    blockedTraffic: [
      { agent: "GPTBot", blockedUrls: 1, rule: "Disallow: /blog/email-automation-101" },
      { agent: "OAI-SearchBot", blockedUrls: 1, rule: "Disallow: /blog/email-automation-101" },
      { agent: "OAI-User", blockedUrls: 1, rule: "Disallow: /blog/email-automation-101" },
    ],
  },
};

// Matches Figma "Opportunity Detail - Content Recovery (Template C)" (node
// 646:15046) — content-visibility scoring comes from our own Playwright
// crawl comparing rendered vs. raw HTML (the same technique the Naver/Google
// AI collectors already use), no 3rd-party dependency.
export const contentRecoveryOpportunityByOrg: Record<string, ContentRecoveryOpportunity> = {
  neodigm: {
    title: "콘텐츠 가시성 회복",
    affectedUrls: 9,
    expectedVisibilityMultiplier: 5.9,
    averageContentVisibility: 22,
    description:
      "AI 에이전트는 접근 가능한 콘텐츠만 읽고 인용할 수 있습니다. 많은 에이전트는 사람이 사용하는 브라우저처럼 JavaScript를 실행해 동적 페이지 콘텐츠를 완전히 로드하지 않습니다. 이 기회는 AI 에이전트가 실사용자와 SEO 봇이 보는 것과 같은 콘텐츠에 더 많이 접근하도록 돕습니다.",
    optimizedCount: 0,
    totalCount: 50,
    urls: [
      { id: "cr-1", url: "https://neodigm.com/ads", status: "not_optimized", contentVisibility: 17, priorityScore: 6.0 },
      { id: "cr-2", url: "https://neodigm.com/email-marketing", status: "not_optimized", contentVisibility: 13, priorityScore: 7.9 },
      { id: "cr-3", url: "https://neodigm.com/blog", status: "not_optimized", contentVisibility: 23, priorityScore: 4.4 },
      { id: "cr-4", url: "https://neodigm.com/jp/analytics", status: "not_optimized", contentVisibility: 21, priorityScore: 4.7 },
    ],
  },
};
