import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CRAWL_URLS, parseCrawlSpec, sameSite } from "./collectorCrawlSpec";

test("sameSite accepts the brand domain and its subdomains only over http(s)", () => {
  assert.equal(sameSite("https://neodigm.com/a", "neodigm.com"), true);
  assert.equal(sameSite("https://www.neodigm.com/a", "neodigm.com"), true);
  assert.equal(sameSite("https://blog.neodigm.com/a", "www.neodigm.com"), true);
  assert.equal(sameSite("https://evilneodigm.com/a", "neodigm.com"), false);
  assert.equal(sameSite("https://neodigm.com.evil.io/a", "neodigm.com"), false);
  assert.equal(sameSite("file:///etc/passwd", "neodigm.com"), false);
  assert.equal(sameSite("http://127.0.0.1:3000/", "neodigm.com"), false);
  assert.equal(sameSite("not a url", "neodigm.com"), false);
});

test("a sitemap crawl spec is normalized with the default limit", () => {
  assert.deepEqual(parseCrawlSpec({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/sitemap.xml" }), {
    domain: "neodigm.com", sitemapUrl: "https://neodigm.com/sitemap.xml", urls: [], limit: 20,
  });
});

test("a re-crawl spec drops the sitemap and clamps the limit", () => {
  const spec = parseCrawlSpec({ domain: "neodigm.com", sitemapUrl: "https://neodigm.com/sitemap.xml", urls: ["https://neodigm.com/a"], limit: 9999 });
  assert.ok(!("error" in spec));
  assert.equal(spec.sitemapUrl, null);
  assert.deepEqual(spec.urls, ["https://neodigm.com/a"]);
  assert.equal(spec.limit, MAX_CRAWL_URLS);
});

test("specs that point outside the brand domain or are malformed are rejected", () => {
  assert.ok("error" in parseCrawlSpec({ domain: "neodigm.com", sitemapUrl: "https://example.org/sitemap.xml" }));
  assert.ok("error" in parseCrawlSpec({ domain: "neodigm.com", urls: ["https://neodigm.com/a", "http://169.254.169.254/x"] }));
  assert.ok("error" in parseCrawlSpec({ domain: "neodigm.com", urls: ["https://neodigm.com/a,https://example.org"] }));
  assert.ok("error" in parseCrawlSpec({ domain: "neodigm.com" }));
  assert.ok("error" in parseCrawlSpec({ domain: "bad domain!", sitemapUrl: "https://neodigm.com/s.xml" }));
  assert.ok("error" in parseCrawlSpec({ domain: "neodigm.com", urls: Array.from({ length: MAX_CRAWL_URLS + 1 }, (_, i) => `https://neodigm.com/${i}`) }));
  assert.ok("error" in parseCrawlSpec(null));
});
