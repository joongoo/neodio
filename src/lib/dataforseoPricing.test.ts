import assert from "node:assert/strict";
import test from "node:test";
import { estimateSerpApiCost } from "./dataforseoPricing";

const counts = { "google-aio": 3, "google-ai-mode": 2, "naver-aio": 4, "naver-ai": 1, gemini: 1 } as const;

test("estimates SERP API queries and USD cost by surface", () => {
  const result = estimateSerpApiCost(counts, new Set(["google-aio", "naver-aio"]), 2);
  assert.deepEqual(result.rows, [
    { surface: "google-aio", queries: 6, unitCostUsd: 0.0012, estimatedCostUsd: 0.0072 },
    { surface: "naver-aio", queries: 4, unitCostUsd: 0.0006, estimatedCostUsd: 0.0024 },
  ]);
  assert.equal(result.totalQueries, 10);
  assert.equal(result.totalCostUsd, 0.0096);
});

test("ignores disabled and unavailable surfaces", () => {
  assert.deepEqual(estimateSerpApiCost(counts, new Set(), 2), { rows: [], totalQueries: 0, totalCostUsd: 0 });
});

test("explicit device choice multiplies every SERP engine and overrides brand AIO count", () => {
 const enabled = new Set(["google-aio", "google-ai-mode", "naver-aio"] as const);
 const mobile = estimateSerpApiCost(counts, enabled, 2, ["mobile"]);
 const both = estimateSerpApiCost(counts, enabled, 1, ["desktop", "mobile"]);
 assert.deepEqual(mobile.rows.map(row => row.queries), [3, 2, 4]);
 assert.deepEqual(both.rows.map(row => row.queries), [6, 4, 8]);
 assert.equal(both.totalCostUsd, mobile.totalCostUsd * 2);
});
