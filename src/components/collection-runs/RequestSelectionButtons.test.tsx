import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSelectionButtons, RequestCollectionActionButtons } from "./RequestCollectControl";
import type { RetrySelectionItem } from "@/lib/requestRetrySelection";

test("collection and cancellation buttons enforce selection eligibility and show disabled affordances", () => {
  const item = (status: RetrySelectionItem["status"], executionKind: RetrySelectionItem["executionKind"] = "legacy", extra: Partial<RetrySelectionItem> = {}): RetrySelectionItem => ({ id: "item", query: "query", surface: "google-aio", device: "desktop", executionKind, status, ...extra });
  const cases: [RetrySelectionItem[], boolean, boolean, boolean][] = [
    [[], false, false, false],
    [[item("reserved")], false, true, true],
    [[item("provider_failed")], false, true, false],
    [[item("collecting")], false, true, false],
    [[item("reserved", "serp-api", { canManagePending: true })], false, true, true],
    [[item("reserved", "serp-api")], false, false, false],
    [[item("reserved"), item("reserved", "serp-api", { canManagePending: true })], false, false, false],
    [[item("parse_failed")], false, false, false],
    [[item("reserved", "legacy", { hasRetry: true })], false, false, false],
    [[item("reserved")], true, false, false],
    [[item("reserved"), item("provider_failed")], false, true, false],
  ];
  for (const [selected, locked, canCollect, canCancel] of cases) {
    const html = renderToStaticMarkup(<RequestCollectionActionButtons selected={selected} locked={locked} onCollect={() => {}} onCancel={() => {}} />);
    const buttons = html.match(/<button\b[^>]*>/g)!;
    assert.equal(buttons.length, 2);
    assert.equal(!buttons[0].includes('disabled=""'), canCollect, JSON.stringify({ selected, locked }));
    assert.equal(!buttons[1].includes('disabled=""'), canCancel, JSON.stringify({ selected, locked }));
    for (const button of buttons) { assert.ok(button.includes("disabled:opacity-40")); assert.ok(button.includes("disabled:cursor-not-allowed")); }
  }
});

test("one filtered cross-page select-all action replaces failed/cancelled buttons", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={1} locked={false} selectableCount={12} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, />전체 선택<\/button>/);
  assert.ok(!html.includes("(12)"));
  assert.ok(!html.includes("실패 항목")); assert.ok(!html.includes("취소 항목"));
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes('aria-pressed="false"'));
  assert.ok(!html.includes("전체 선택 해제"));
});

test("empty filtered results disable the single toggle", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={0} locked={false} selectableCount={0} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.match(html, /<button[^>]*disabled=""[^>]*>전체 선택<\/button>/);
  assert.equal((html.match(/<button/g) ?? []).length, 1);
  assert.ok(html.includes('aria-pressed="false"'));
});

test("fully selected filter results show pressed toggle and clearing label", () => {
  const html = renderToStaticMarkup(<RequestSelectionButtons selectedCount={2501} locked={false} selectableCount={2501} onSelectAll={() => {}} onClearSelection={() => {}} />);
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("ring-2"));
  assert.match(html, />전체 선택 해제<\/button>/);
  assert.ok(!html.includes("2501"));
  assert.equal((html.match(/<button/g) ?? []).length, 1);
});
