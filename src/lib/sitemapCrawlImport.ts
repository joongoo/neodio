import type { SitemapCrawlResult, SitemapCrawlUrlResult } from "@/lib/db/types";

// 수집기가 사용자 PC에서 크롤한 결과를 서버가 받을 때의 검증 — 브라우저가 올리는 값이라 믿지 않고
// 모양을 다시 만들어(허용한 필드만, 범위·길이 제한) 저장한다. 순수 함수라 서버 API와 테스트가 같이 쓴다.
export const MAX_CRAWLS_PER_IMPORT = 10;
export const MAX_URLS_PER_CRAWL = 500;

const clampPercent = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0);
const nonNegative = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

function sanitizeUrlResult(item: unknown): SitemapCrawlUrlResult | null {
  const r = item as Record<string, unknown> | null;
  if (!r || typeof r.url !== "string" || !/^https?:\/\//i.test(r.url) || r.url.length > 2048) return null;
  const failed = r.status === "failed";
  return {
    url: r.url,
    status: failed ? "failed" : "success",
    rawTextLength: nonNegative(r.rawTextLength),
    renderedTextLength: nonNegative(r.renderedTextLength),
    contentVisibility: clampPercent(r.contentVisibility),
    complexityScore: clampPercent(r.complexityScore),
    hasFaq: r.hasFaq === true,
    hasToc: r.hasToc === true,
    imageAltCoverage: clampPercent(r.imageAltCoverage),
    hasStructuredData: r.hasStructuredData === true,
    error: typeof r.error === "string" && r.error ? r.error.slice(0, 300) : null,
  };
}

/** 검증을 통과한 크롤 결과. 모양이 틀렸으면 null. */
export function sanitizeSitemapCrawl(input: unknown): SitemapCrawlResult | null {
  const r = input as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const domain = text(r.domain, 253).trim();
  const crawledAt = typeof r.crawledAt === "string" ? r.crawledAt : "";
  if (!domain || !crawledAt || Number.isNaN(new Date(crawledAt).getTime())) return null;
  if (!Array.isArray(r.urls) || r.urls.length > MAX_URLS_PER_CRAWL) return null;
  const urls = r.urls.map(sanitizeUrlResult).filter((u): u is SitemapCrawlUrlResult => u !== null);
  if (urls.length === 0) return null;
  return { domain, sitemapUrl: text(r.sitemapUrl, 2048) || "manual-recheck", crawledAt: new Date(crawledAt).toISOString(), urls };
}
