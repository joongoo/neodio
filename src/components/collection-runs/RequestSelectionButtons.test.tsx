import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSelectionButtons } from "./RequestCollectControl";

test("bulk selection buttons expose independent toggle states and allow clearing any selection", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={1} locked={false} groupsSelected={{ failed: true, cancelled: false }} onSelectGroup={() => {}} onClearSelection={() => {}} />);
  assert.match(html, /aria-pressed="true"[^>]*>실패 항목 전체 선택/);
  assert.match(html, /aria-pressed="false"[^>]*>취소 항목 전체 선택/);
  assert.match(html, /<button(?![^>]*disabled)[^>]*>전체 선택 해제<\/button>/);
  const empty = renderToStaticMarkup(<RequestSelectionButtons selectedCount={0} locked={false} groupsSelected={{ failed: false, cancelled: false }} onSelectGroup={() => {}} onClearSelection={() => {}} />);
  assert.match(empty, /<button[^>]*disabled=""[^>]*>전체 선택 해제<\/button>/);
});

test("empty filtered groups are dimmed and disabled independently", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={1} locked={false} groupsSelected={{ failed: false, cancelled: false }} groupCounts={{ failed: 0, cancelled: 2 }} onSelectGroup={() => {}} onClearSelection={() => {}} />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>실패 항목 전체 선택 \(0\)/);
  assert.match(html, /<button(?![^>]*disabled="")[^>]*>취소 항목 전체 선택 \(2\)/);
  assert.ok(html.includes("disabled:opacity-40"));
});
