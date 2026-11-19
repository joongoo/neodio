import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestProgressStages, RequestRefreshIndicator } from "./RequestDetailLive";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import { RequestSummary, requestItemStatusLabel } from "./RequestLogViews";
import { PendingRunDetail, StatusBadge } from "./CollectionRunsClient";
import { toPendingRunListRow } from "@/lib/collectionRunList";
import type { ProviderTaskRecord } from "@/lib/backend/dataforseo/types";
import type { RunListRow } from "@/lib/collectionRunList";
import { REQUEST_ITEM_STATUSES } from "@/lib/requestItemFilters";

test("item table badges simplify queue phases without changing internal failure labels", () => {
  for (const status of REQUEST_ITEM_STATUSES) {
    const html = renderToStaticMarkup(<StatusBadge file={{ progressStatus: status, state: "failed" } as RunListRow} />);
    assert.ok(html.includes(`>${requestItemStatusLabel(status, false)}</span>`), status);
    assert.ok(!html.includes(">실패</span>"));
  }
  const serp = renderToStaticMarkup(<StatusBadge file={{ progressStatus: "reserved", collectedBy: "dataforseo", state: "pending" } as RunListRow} />);
  assert.ok(serp.includes(">제출 중</span>"));
  assert.equal(requestItemStatusLabel("reserved", false), "수집 대기");
  assert.equal(requestItemStatusLabel("queued", true), "수집 중");
});

test("older pending history links to request controls instead of direct-submit/delete actions", () => {
  const task = { id: "ptask-1", collectionRequestId: "creq-1", status: "reserved", surface: "google-aio" } as ProviderTaskRecord;
  const html = renderToStaticMarkup(<PendingRunDetail file={toPendingRunListRow(task)} />);
  assert.ok(html.includes("/collection-runs/creq-1"));
  assert.ok(html.includes("비용 확인")); assert.ok(html.includes("이력은 유지"));
  assert.ok(!html.includes("지금 제출")); assert.ok(!html.includes("예약 삭제"));
  const orphan = renderToStaticMarkup(<PendingRunDetail file={toPendingRunListRow({ ...task, collectionRequestId: null })} />);
  assert.ok(orphan.includes("직접 실행하거나 삭제할 수 없습니다"));
  assert.ok(!orphan.includes("<button"));
});

test("top summary keeps request metadata without costs, duplicate counts or channels", () => {
  const request = { status: "running", createdAt: "2026-11-18T00:00:00Z", requestedBy: { name: "테스트 요청자" }, estimatedCostUsd: 0.12, actualCostUsd: 0.06,
    surfaces: ["google-aio", "gemini"], counts: { total: 20, completed: 8, waiting: 2, running: 6, failed: 2, attention: 1, cancelled: 1 } } as RequestLogRow;
  const html = renderToStaticMarkup(<RequestSummary request={request} />);
  for (const text of ["진행 중", "테스트 요청자"]) assert.ok(html.includes(text), text);
  for (const text of ["전체 20", "완료 8", "대기 2", "실패 2", "Google", "Gemini", "$0.1200", "$0.0600", "USD"]) assert.ok(!html.includes(text), text);
});

test("progress shows independent stages including partial results and uncertain submissions", () => {
  const request = { counts: { total: 20, waiting: 2, running: 6, completed: 8, failed: 2, attention: 1, cancelled: 1 },
    phases: { submitting: 1, collecting: 3, processing: 2 }, actualCostUsd: 0.0126, estimatedCostUsd: 0.5 } as RequestLogRow;
  const html = renderToStaticMarkup(<RequestProgressStages request={request} />);
  for (const label of ["수집 대기", "제출 중", "수집 중", "결과 반영 중", "완료", "실패", "제출 확인 필요", "취소"]) assert.ok(html.includes(label), label);
  assert.match(html, /수집 중<\/dt><dd[^>]*>3<\/dd>/);
  const queued = renderToStaticMarkup(<RequestProgressStages request={{ ...request, phases: { ...request.phases!, serpWaiting: 2 } }} />);
  assert.match(queued, /제출 중<\/dt><dd[^>]*>3<\/dd>/);
  assert.match(queued, /수집 대기<\/dt><dd[^>]*>0<\/dd>/);
  assert.ok(html.includes("전체 완료를 기다리지 않고"));
  assert.ok(html.includes("실제 발생 예상 비용"));
  assert.ok(html.includes("$0.0126"));
  assert.ok(html.includes("USD"));
  assert.ok(!html.includes("$0.5000"));
  for (const label of ["SERP API 소요 시간", "로컬 수집기 소요 시간", "총 요청 처리 소요 시간"]) assert.ok(html.includes(label));
  const timing = { hasItems: true, finished: true, startedAt: "2026-11-19T00:00:00Z", completedAt: "2026-11-19T00:02:03Z", measuredAt: "2026-11-20T00:00:00Z" };
  const timed = renderToStaticMarkup(<RequestProgressStages request={{ ...request, durations: { serpApi: timing, local: { ...timing, hasItems: false }, total: timing } }} />);
  assert.ok(timed.includes("2분 3초"));
  const free = renderToStaticMarkup(<RequestProgressStages request={{ ...request, actualCostUsd: 0 }} />);
  assert.match(free, /실제 발생 예상 비용<\/dt><dd[^>]*>-<\/dd>/);
});

test("refresh feedback displays countdown and successful update/next refresh timestamps", () => {
  const lastUpdatedAt = Date.parse("2026-11-18T00:00:00Z");
  const html = renderToStaticMarkup(<RequestRefreshIndicator state={{ phase: "waiting", secondsUntilRefresh: 3, lastUpdatedAt, nextRefreshAt: lastUpdatedAt + 5000 }} />);
  assert.ok(html.includes("3초 후 새로고침"));
  assert.ok(html.includes("마지막 갱신 09:00:00 · 다음 09:00:05 (KST)"));
  assert.ok(!html.includes("animate-spin"));
});

test("refreshing shows spinner; paused and stopped states do not promise another refresh", () => {
  const common = { secondsUntilRefresh: null, lastUpdatedAt: null, nextRefreshAt: null };
  const html = renderToStaticMarkup(<RequestRefreshIndicator state={{ ...common, phase: "refreshing" }} />);
  assert.ok(html.includes("새로고침 중…")); assert.ok(html.includes("animate-spin"));
  for (const phase of ["paused", "stopped"] as const) {
    const stopped = renderToStaticMarkup(<RequestRefreshIndicator state={{ ...common, phase }} />);
    assert.ok(stopped.includes(phase === "paused" ? "자동 갱신 일시 중지" : "자동 갱신 중지"));
    assert.ok(!stopped.includes("초 후 새로고침")); assert.ok(!stopped.includes("animate-spin"));
  }
});
