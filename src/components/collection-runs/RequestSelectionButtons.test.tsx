import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSelectionButtons } from "./RequestCollectControl";

test("one filtered cross-page select-all action replaces failed/cancelled buttons", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={1} locked={false} selectableCount={12} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, />전체 선택 \(12\)/);
  assert.ok(!html.includes("실패 항목")); assert.ok(!html.includes("취소 항목"));
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(!html.includes("전체 선택 해제"));
});

test("empty filtered results disable the single toggle", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={0} locked={false} selectableCount={0} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>전체 선택 \(0\)/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes('aria-pressed="false"'));
});

test("fully selected filter results show pressed toggle and clearing label", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={2501} locked={false} selectableCount={2501} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("ring-2"));
  assert.match(html, />전체 선택 해제 \(2501\)/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
});
