import assert from "node:assert/strict";
import test from "node:test";
import { parseFilters } from "./filterOptions";

test("선택값을 서버 필터 id로 바꾼다", () => {
  const p = parseFilters({ range: "1w", market: "KR", model: "Gemini", scope: "일반 질의" });
  assert.equal(p.range, "1w");
  assert.deepEqual(p.filters, { marketId: "market-kr", llmModelId: "model-gemini-25", queryScope: "nonbrand" });
  assert.equal(p.marketLabel, "KR");
});

test("알 수 없거나 비어 있는 값은 필터 없음(전체)", () => {
  const p = parseFilters({ range: "9w", market: "XX", model: "없는모델", scope: "이상한" });
  assert.equal(p.range, "4w");
  assert.deepEqual(p.filters, {});
  assert.equal(p.marketLabel, "전체");
  assert.equal(p.modelLabel, "전체");
  assert.equal(p.scopeLabel, "전체");
});
