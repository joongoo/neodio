import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestAttentionCard } from "./RequestAttentionCard";
import { RequestFilters } from "./RequestLogViews";

test("attention card shows task count and opens the exact attention request filter", () => {
  const html = renderToStaticMarkup(<RequestAttentionCard count={4} path="/org/brand/collection-runs" active={false} />);
  assert.ok(html.includes("확인 필요"));
  assert.ok(html.includes("로컬·Gemini·SERP API"));
  assert.ok(html.includes("취소 건은 제외"));
  assert.ok(html.includes("분석 실패·취소 건은 제외"));
  assert.ok(html.includes("제출 실패·제출 여부 불명확"));
  assert.ok(html.includes('href="/org/brand/collection-runs?attention=1"'));
  assert.match(html, /<strong[^>]*>4<span/);
  assert.ok(!html.includes('aria-current="page"'));
});

test("active shortcut has an escape route and survives subsequent filter submissions", () => {
  const html = renderToStaticMarkup(<RequestAttentionCard count={0} path="/org/brand/collection-runs" active />);
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes("전체 요청 보기"));
  const filters = renderToStaticMarkup(<RequestFilters path="/org/brand/collection-runs" query={new URLSearchParams("attention=1")} />);
  assert.match(filters, /name="attention"[^>]*value="1"/);
});
