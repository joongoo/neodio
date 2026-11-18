import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestDetailFilters } from "./RequestDetailFilters";
import { requestSelectionScope, filterValues } from "@/lib/requestItemFilters";

test("detail filters reuse library dropdowns without a GET submit form", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled&surface=gemini&sort=newest" onChange={() => {}} />);
  for (const label of ["상태", "플랫폼", "정렬", "취소", "Gemini", "최신순"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("<form")); assert.ok(!html.includes("<select")); assert.ok(!html.includes(">조회<"));
});

test("multi-select shows counts and disables empty unselected options but allows clearing selected values", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled,parse_failed&surface=gemini" facets={{ status: { parse_failed: 2 }, surface: { gemini: 2 }, retry: { failed: 2, cancelled: 0 } }} onChange={() => {}} />);
  assert.ok(html.includes("aria-checked=\"true\""));
  assert.ok(html.includes("opacity-40"));
  assert.ok(html.includes("disabled=\"\""));
  assert.match(html, /role="checkbox" aria-checked="true" aria-disabled="false"/);
});

test("options are full-width checkbox buttons and loading preserves their focusability", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled" loading facets={{ status: { cancelled: 1 }, surface: {}, retry: { failed: 0, cancelled: 1 } }} onChange={() => {}} />);
  assert.match(html, /<button type="button" role="checkbox" aria-checked="true" aria-disabled="true" class="flex w-full/);
  assert.equal((html.match(/lucide-chevron-down/g) ?? []).length, 3);
  assert.ok(!html.includes("▾"));
});

test("selection scope follows filters but not pagination or sorting", () => {
  const query = new URLSearchParams("surface=gemini&q=test&page=3&status=parse_failed,cancelled");
  assert.deepEqual(filterValues(query, "status"), ["parse_failed", "cancelled"]);
  assert.equal(query.get("surface"), "gemini");
  assert.equal(query.get("q"), "test");
  const next = new URLSearchParams(query);
  const before = requestSelectionScope(next);
  next.set("page", "2"); next.set("sort", "newest");
  assert.equal(requestSelectionScope(next), before);
  next.set("surface", "google-aio");
  assert.notEqual(requestSelectionScope(next), before);
});
