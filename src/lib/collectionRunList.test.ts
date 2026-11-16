import assert from "node:assert/strict";
import test from "node:test";
import { engineLabel, pageRunList, toPendingRunListRow, toRunListRow, type RunListRow } from "./collectionRunList";
import type { CollectedRunFile } from "@/lib/backend/collectionRunsTypes";
import type { ProviderTaskRecord } from "@/lib/backend/dataforseo/types";

const file = (n: number, extra: Record<string, unknown> = {}): CollectedRunFile => ({
  dir: ".tmp/google-ai",
  filename: `run-${n}.json`,
  promptRun: {
    id: `r${n}`, promptId: "p", llmModelId: "m", marketId: "kr", runAt: "2026-09-02T00:00:00Z", status: "success",
    rawResponse: "x".repeat(500),
    rawMetadata: { source: "google-ai-overview", query: `질의 ${n}`, citations: [{ title: "t", url: "u", domain: "d", isOwnDomain: false }], ...extra },
  },
});

test("행에는 원문이 없고 길이·인용 수만 있다", () => {
  const row = toRunListRow(file(1));
  assert.equal(row.answerLength, 500);
  assert.equal(row.citationCount, 1);
  assert.equal(row.state, "success");
  assert.equal("rawResponse" in row, false);
  assert.ok(JSON.stringify(row).length < 400);
});

test("캡차로 막힌 실행은 blocked", () => {
  assert.equal(toRunListRow(file(1, { finalUrl: "https://google.com/sorry/index" })).state, "blocked");
});

test("DataForSEO 실행은 수집 로그 엔진에 SERP API를 명시한다", () => {
  const row = toRunListRow(file(1, { source: "google-aio", collectedBy: "dataforseo" }));
  assert.equal(engineLabel(row), "구글AIO · SERP API");
});

test("진행 중인 Provider 작업도 원래 질의로 수집 로그 행을 만든다", () => {
  const task = {
    id: "ptask-1", surface: "google-aio", querySnapshot: "마케팅 자동화 ROI 계산", status: "collecting",
    createdAt: "2026-11-16T01:00:00.000Z",
  } as ProviderTaskRecord;
  const row = toPendingRunListRow(task);
  assert.equal(row.query, "마케팅 자동화 ROI 계산");
  assert.equal(row.state, "pending");
  assert.equal(row.progressStatus, "collecting");
  assert.equal(engineLabel(row), "구글AIO · SERP API");
});

const rows: RunListRow[] = Array.from({ length: 60 }, (_, i) => toRunListRow(file(i + 1)));

test("페이지를 자르고 범위를 벗어난 페이지는 맞춘다", () => {
  const p1 = pageRunList(rows, { pageSize: 25 });
  assert.equal(p1.rows.length, 25);
  assert.equal(p1.pageCount, 3);
  assert.equal(pageRunList(rows, { page: 3, pageSize: 25 }).rows.length, 10);
  assert.equal(pageRunList(rows, { page: 99, pageSize: 25 }).page, 3);
  assert.equal(pageRunList(rows, { pageSize: 7 }).pageSize, 25); // 허용 안 된 크기는 기본값
});

test("검색은 질의·엔진·카테고리·토픽을 본다", () => {
  assert.equal(pageRunList(rows, { search: "질의 12" }).filteredTotal, 1);
  assert.equal(pageRunList(rows, { search: "google ai 모드" }).filteredTotal, 60);
  assert.equal(pageRunList(rows, { search: "없는말" }).filteredTotal, 0);
});
