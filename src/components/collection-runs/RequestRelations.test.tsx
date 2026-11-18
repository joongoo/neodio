import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestRelations } from "./RequestRelations";
import { runColumns } from "./CollectionRunsClient";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import type { RunListRow } from "@/lib/collectionRunList";

const request = (id: string): RequestLogRow => ({ id, clientRequestId: id, requestKind: "retry", requestedBy: null,
  createdAt: "2026-11-18T00:00:00.000Z", approvedAt: "2026-11-18T00:00:00.000Z", completedAt: null, status: "running",
  surfaces: ["google-aio"], devices: ["desktop"], counts: { total: 8, waiting: 3, running: 3, completed: 2, failed: 0, attention: 0, cancelled: 0 },
  estimatedCostUsd: 0, actualCostUsd: 0, cancelRequested: false, retryOfRequestId: null });
const common = { path: "/org/brand/collection-runs/current", query: "page=2&q=test", listPath: "/org/brand/collection-runs", itemCount: 8 };

test("request relations link in both directions and show retry progress", () => {
  const html = renderToStaticMarkup(<RequestRelations {...common} parent={request("original")} retries={[request("retry")]} total={1} page={1} pageCount={1} />);
  assert.ok(html.includes("원본 요청에서 8건 재수집"));
  assert.ok(html.includes('href="/org/brand/collection-runs/original"'));
  assert.ok(html.includes('href="/org/brand/collection-runs/retry"'));
  assert.ok(html.includes("완료 2 / 8건"));
  assert.ok(html.includes("진행 중"));
  assert.ok(html.includes("원본 결과는 보존됩니다"));
});

test("relations stay hidden when empty and paginate separately from execution items", () => {
  assert.equal(renderToStaticMarkup(<RequestRelations {...common} parent={null} retries={[]} total={0} page={1} pageCount={1} />), "");
  const html = renderToStaticMarkup(<RequestRelations {...common} parent={null} retries={[request("retry")]} total={11} page={1} pageCount={2} />);
  assert.ok(html.includes("page=2&amp;q=test&amp;retriesPage=2"));
});

test("item status keeps original failure and provides a retry request link", () => {
  const row: RunListRow = { key: "original-task", dir: "provider-task", filename: "original-task", runAt: "2026-11-18T00:00:00.000Z", source: "google-aio", query: "query",
    answerLength: null, citationCount: null, state: "failed", progressStatus: "provider_failed", retryRequests: [{ href: "/org/brand/collection-runs/retry", status: "completed" }] };
  const column = runColumns(() => {}).find(item => item.key === "status")!;
  const html = renderToStaticMarkup(<>{column.render(row)}</>);
  assert.ok(html.includes("실패"));
  assert.ok(html.includes("재수집 요청됨"));
  assert.ok(html.includes("완료"));
  assert.ok(html.includes('href="/org/brand/collection-runs/retry"'));
});
