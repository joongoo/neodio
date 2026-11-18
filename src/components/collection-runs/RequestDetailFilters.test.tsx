import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestDetailFilters } from "./RequestDetailFilters";

test("detail filters reuse library dropdowns without a GET submit form", () => {
  const html = renderToStaticMarkup(<RequestDetailFilters query="status=cancelled&surface=gemini&sort=newest" onChange={() => {}} />);
  for (const label of ["상태", "플랫폼", "정렬", "취소", "Gemini", "최신순"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("<form")); assert.ok(!html.includes("<select")); assert.ok(!html.includes(">조회<"));
});
