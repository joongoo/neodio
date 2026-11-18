import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSelectionButtons } from "./RequestCollectControl";

test("one filtered cross-page select-all action replaces failed/cancelled buttons", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={1} locked={false} selectableCount={12} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, />전체 선택 \(12\)/);
  assert.ok(!html.includes("실패 항목")); assert.ok(!html.includes("취소 항목"));
  assert.match(html, /<button(?![^>]*disabled)[^>]*>전체 선택 해제<\/button>/);
});

test("empty filtered results disable select-all and empty selection disables clearing", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={0} locked={false} selectableCount={0} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>전체 선택 \(0\)/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>전체 선택 해제<\/button>/);
});
