import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestProgressStages, RequestRefreshIndicator } from "./RequestDetailLive";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import { RequestSummary } from "./RequestLogViews";

test("top summary keeps request metadata and costs without duplicate counts or channels", () => {
  const request = { status: "running", createdAt: "2026-11-18T00:00:00Z", requestedBy: { name: "테스트 요청자" }, estimatedCostUsd: 0.12, actualCostUsd: 0.06,
    surfaces: ["google-aio", "gemini"], counts: { total: 20, completed: 8, waiting: 2, running: 6, failed: 2, attention: 1, cancelled: 1 } } as RequestLogRow;
  const html = renderToStaticMarkup(<RequestSummary request={request} />);
  for (const text of ["진행 중", "테스트 요청자", "$0.1200", "$0.0600", "USD"]) assert.ok(html.includes(text), text);
  for (const text of ["전체 20", "완료 8", "대기 2", "실패 2", "Google", "Gemini"]) assert.ok(!html.includes(text), text);
});

test("progress shows independent stages including partial results and uncertain submissions", () => {
  const request = { counts: { total: 20, waiting: 2, running: 6, completed: 8, failed: 2, attention: 1, cancelled: 1 },
    phases: { submitting: 1, collecting: 3, processing: 2 } } as RequestLogRow;
  const html = renderToStaticMarkup(<RequestProgressStages request={request} />);
  for (const label of ["수집 대기", "제출 중", "수집·회수 중", "결과 반영 중", "완료", "실패", "제출 확인 필요", "취소"]) assert.ok(html.includes(label), label);
  assert.match(html, /수집·회수 중<\/dt><dd[^>]*>3<\/dd>/);
  assert.ok(html.includes("전체 완료를 기다리지 않고"));
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
