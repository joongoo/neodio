import assert from "node:assert/strict";
import test from "node:test";
import { buildCitationFeatureAnalysis, urlKey } from "./citationFeatures";
import type { SitemapCrawlUrlResult } from "@/lib/db/types";

const page = (path: string, extra: Partial<SitemapCrawlUrlResult> = {}): SitemapCrawlUrlResult => ({
  url: `https://www.example.com${path}`,
  status: "success",
  rawTextLength: 100,
  renderedTextLength: 100,
  contentVisibility: 80,
  error: null,
  ...extra,
});

test("urlKey는 www·끝 슬래시·쿼리·대소문자를 무시한다", () => {
  assert.equal(urlKey("https://www.Example.com/a/?x=1#h"), urlKey("example.com/a"));
});

test("속성이 있는 페이지와 없는 페이지의 인용률을 비교한다", () => {
  const pages = [
    page("/1", { hasFaq: true }),
    page("/2", { hasFaq: true }),
    page("/3", { hasFaq: false }),
    page("/4", { hasFaq: false }),
    page("/5", { hasFaq: false }),
  ];
  const result = buildCitationFeatureAnalysis(pages, ["https://example.com/1/", "https://example.com/2", "https://example.com/3"])!;
  const faq = result.features.find((f) => f.id === "faq")!;
  assert.deepEqual(faq.withFeature, { pages: 2, cited: 2 });
  assert.deepEqual(faq.withoutFeature, { pages: 3, cited: 1 });
  assert.equal(faq.liftPoints, 67); // 100% - 33%
  assert.equal(result.citedPages, 3);
  // 측정하지 않은 속성(구조화 데이터)은 목록에서 빠진다
  assert.equal(result.features.some((f) => f.id === "structured-data"), false);
});

test("표본이 너무 적거나 인용이 없으면 null", () => {
  assert.equal(buildCitationFeatureAnalysis([page("/1")], ["https://example.com/1"]), null);
  assert.equal(buildCitationFeatureAnalysis([1, 2, 3, 4, 5].map((n) => page(`/${n}`)), []), null);
});
