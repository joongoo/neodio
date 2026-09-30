import type { CollectorCrawlSpec } from "./collectorAgent";

// 사이트맵 크롤 작업 입력의 검증 — 수집기(collector/agent.ts)가 브라우저 화면에서 받은 값을 믿지 않고 다시 만든다.
// 크롤 대상은 화면이 알려준 브랜드 도메인(과 그 하위 도메인)의 주소만 받는다 — 화면이 다른 사이트를 크롤시키지 못하게.
export const MAX_CRAWL_URLS = 100;
export const DEFAULT_CRAWL_LIMIT = 20;

export function sameSite(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const base = domain.toLowerCase().replace(/^www\./, "");
    return host === base || host === `www.${base}` || host.endsWith(`.${base}`);
  } catch {
    return false;
  }
}

export function parseCrawlSpec(input: unknown): CollectorCrawlSpec | { error: string } {
  const body = (input ?? {}) as { domain?: unknown; sitemapUrl?: unknown; urls?: unknown; limit?: unknown };
  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!domain || domain.length > 253 || !/^[\w.-]+$/.test(domain)) return { error: "도메인이 올바르지 않습니다." };
  const sitemapUrl = typeof body.sitemapUrl === "string" && body.sitemapUrl.trim() ? body.sitemapUrl.trim() : null;
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u): u is string => typeof u === "string").map((u) => u.trim()).filter(Boolean);
  if (!sitemapUrl && urls.length === 0) return { error: "사이트맵 주소나 재크롤할 URL이 필요합니다." };
  if (urls.length > MAX_CRAWL_URLS) return { error: `URL은 최대 ${MAX_CRAWL_URLS}개까지 크롤할 수 있습니다.` };
  if (sitemapUrl && (!sameSite(sitemapUrl, domain) || sitemapUrl.length > 2048)) return { error: "사이트맵 주소가 이 브랜드의 도메인이 아닙니다." };
  if (urls.some((u) => !sameSite(u, domain) || u.length > 2048 || u.includes(","))) return { error: "이 브랜드의 도메인이 아닌 URL이 있습니다." };
  const limit = Math.max(1, Math.min(MAX_CRAWL_URLS, Math.round(Number(body.limit)) || DEFAULT_CRAWL_LIMIT));
  return { domain, sitemapUrl: urls.length > 0 ? null : sitemapUrl, urls, limit };
}
