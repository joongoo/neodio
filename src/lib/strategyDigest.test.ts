import test from "node:test";
import assert from "node:assert/strict";
import { formatSitemapDigest, formatTrendDigest, toSearchKeyword } from "./strategyDigest";
import { computeSignals, fillPeriods, type TrendResult } from "./searchTrend";
import type { SitemapCrawlResult } from "@/lib/db/types";

const result: TrendResult = {
  startDate: "2026-01-01",
  endDate: "2026-06-30",
  timeUnit: "month",
  series: [
    { groupName: "네오다임", keywords: ["네오다임"], data: ["01", "02", "03", "04", "05", "06"].map((m, i) => ({ period: `2026-${m}-01`, ratio: 10 + i * 5 })) },
    { groupName: "마케팅 자동화", keywords: ["마케팅 자동화"], data: ["01", "02", "03", "04", "05", "06"].map((m) => ({ period: `2026-${m}-01`, ratio: 40 })) },
  ],
};

test("formatTrendDigest lists every group with momentum and relative-value caveat", () => {
  const filled = fillPeriods(result);
  const text = formatTrendDigest("네오다임", [{ result: filled, signals: computeSignals(filled), label: "자사 단독", ownName: "네오다임" }]);
  assert.match(text, /상대값/);
  assert.match(text, /- 네오다임 \(자사\): /);
  assert.match(text, /- 마케팅 자동화: /);
  assert.match(text, /월별 10,15,20,25,30,35/);
});

test("formatTrendDigest is empty without batches", () => {
  assert.equal(formatTrendDigest("x", []), "");
});

const crawl: SitemapCrawlResult = {
  domain: "example.com",
  sitemapUrl: "https://example.com/sitemap.xml",
  crawledAt: "2026-09-29T09:00:00.000Z",
  urls: [
    { url: "https://example.com/", status: "success", rawTextLength: 10, renderedTextLength: 10, contentVisibility: 100, hasFaq: true, hasToc: false, hasStructuredData: true, error: null },
    { url: "https://example.com/blog/a", status: "success", rawTextLength: 10, renderedTextLength: 4, contentVisibility: 40, hasFaq: false, hasToc: false, hasStructuredData: false, error: null },
    { url: "https://example.com/x", status: "failed", rawTextLength: 0, renderedTextLength: 0, contentVisibility: 0, error: "timeout" },
  ],
};

test("formatSitemapDigest summarizes gaps and flags weak pages", () => {
  const text = formatSitemapDigest(crawl);
  assert.match(text, /3개 중 2개 수집 성공, 1개 실패/);
  assert.match(text, /FAQ 없음 1개/);
  assert.match(text, /\/blog\/a \[FAQ 없음, 목차 없음, 구조화 데이터 없음, 가시성 40\]/);
  assert.match(text, /수집 실패: \/x/);
});

test("formatSitemapDigest is empty without urls", () => {
  assert.equal(formatSitemapDigest({ ...crawl, urls: [] }), "");
});

test("toSearchKeyword trims generic trailing words but never returns empty", () => {
  assert.equal(toSearchKeyword("마케토 구축 파트너 추천"), "마케토 구축 파트너");
  assert.equal(toSearchKeyword("마케팅 자동화 업체 비교"), "마케팅 자동화");
  assert.equal(toSearchKeyword("추천"), "추천");
});

test("formatTrendDigest folds uncollected groups into one line", () => {
  const empty: TrendResult = { ...result, series: [...result.series, { groupName: "없는 주제", keywords: ["없는 주제"], data: [] }] };
  const filled = fillPeriods(empty);
  const text = formatTrendDigest("네오다임", [{ result: filled, signals: computeSignals(filled), label: "자사 단독", ownName: "네오다임" }]);
  assert.match(text, /검색량이 적어 집계되지 않음\(관심도를 판단할 수 없음\): 없는 주제/);
  assert.doesNotMatch(text, /- 없는 주제: /);
});
