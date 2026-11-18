import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestDetailFilters } from "./RequestDetailFilters";

test("detail filters reuse library dropdowns without a GET submit form", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled&surface=gemini&sort=newest" onChange={() => {}} />);
  for (const label of ["상태", "플랫폼", "정렬", "취소", "Gemini", "최신순"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("<form")); assert.ok(!html.includes("<select")); assert.ok(!html.includes(">조회<"));
});

test("multi-select shows counts and disables empty unselected options but allows clearing selected values", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled,parse_failed&surface=gemini" facets={{ status: { parse_failed: 2 }, surface: { gemini: 2 }, retry: { failed: 2, cancelled: 0 } }} onChange={() => {}} />);
  assert.ok(html.includes("checked=\"\""));
  assert.ok(html.includes("opacity-40"));
  assert.ok(html.includes("disabled=\"\""));
  assert.ok(html.includes("type=\"checkbox\" checked=\"\""));
});
