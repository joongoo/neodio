import assert from "node:assert/strict";
import test from "node:test";
import { MAX_URLS_PER_CRAWL, sanitizeSitemapCrawl } from "./sitemapCrawlImport";

const good = {
  domain: "neodigm.com",
  sitemapUrl: "https://neodigm.com/sitemap.xml",
  crawledAt: "2026-09-30T01:00:00.000Z",
  urls: [
    { url: "https://neodigm.com/a", status: "success", rawTextLength: 100, renderedTextLength: 400, contentVisibility: 25, complexityScore: 70, hasFaq: true, hasToc: false, imageAltCoverage: 80, hasStructuredData: true, error: null },
  ],
};

test("a well-formed crawl passes and is re-shaped", () => {
  const result = sanitizeSitemapCrawl({ ...good, extra: "ignored", urls: [{ ...good.urls[0], evil: "x" }] });
  assert.ok(result);
  assert.deepEqual(Object.keys(result).sort(), ["crawledAt", "domain", "sitemapUrl", "urls"]);
  assert.deepEqual(Object.keys(result.urls[0]).sort(), ["complexityScore", "contentVisibility", "error", "hasFaq", "hasStructuredData", "hasToc", "imageAltCoverage", "rawTextLength", "renderedTextLength", "status", "url"]);
});

test("numbers are clamped, bad urls dropped, unknown status becomes success only when not failed", () => {
  const result = sanitizeSitemapCrawl({
    ...good,
    urls: [
      { ...good.urls[0], contentVisibility: 999, complexityScore: -5, rawTextLength: -1 },
      { ...good.urls[0], url: "javascript:alert(1)" },
      { ...good.urls[0], url: "https://neodigm.com/b", status: "failed", error: "x".repeat(1000) },
    ],
  });
  assert.ok(result);
  assert.equal(result.urls.length, 2);
  assert.equal(result.urls[0].contentVisibility, 100);
  assert.equal(result.urls[0].complexityScore, 0);
  assert.equal(result.urls[0].rawTextLength, 0);
  assert.equal(result.urls[1].status, "failed");
  assert.equal(result.urls[1].error?.length, 300);
});

test("malformed crawls are rejected", () => {
  assert.equal(sanitizeSitemapCrawl(null), null);
  assert.equal(sanitizeSitemapCrawl({ ...good, domain: "" }), null);
  assert.equal(sanitizeSitemapCrawl({ ...good, crawledAt: "not a date" }), null);
  assert.equal(sanitizeSitemapCrawl({ ...good, urls: [] }), null);
  assert.equal(sanitizeSitemapCrawl({ ...good, urls: [{ url: "ftp://x" }] }), null);
  assert.equal(sanitizeSitemapCrawl({ ...good, urls: Array.from({ length: MAX_URLS_PER_CRAWL + 1 }, () => good.urls[0]) }), null);
});

test("crawledAt is normalized to ISO so the same crawl always maps to the same record", () => {
  const result = sanitizeSitemapCrawl({ ...good, crawledAt: "2026-09-30T10:00:00+09:00" });
  assert.equal(result?.crawledAt, "2026-09-30T01:00:00.000Z");
});
