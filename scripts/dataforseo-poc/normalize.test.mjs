import assert from "node:assert/strict";
import test from "node:test";
import { isTaskComplete, isTaskFailure, isTaskPending } from "./client.mjs";
import { normalizeResult } from "./normalize.mjs";

test("DataForSEO queue 상태를 실패로 오판하지 않는다", () => {
  for (const status_code of [20100, 40601, 40602]) {
    const task = { status_code, result: null };
    assert.equal(isTaskPending(task), true);
    assert.equal(isTaskFailure(task), false);
    assert.equal(isTaskComplete(task), false);
  }
});

test("부분 결과 상태는 결과 배열이 있으면 완료로 처리한다", () => {
  const task = { status_code: 40106, result: [] };
  assert.equal(isTaskComplete(task), true);
  assert.equal(isTaskFailure(task), false);
});

test("AI 본문과 중복 제거된 인용 순서를 정규화한다", () => {
  const submission = { tasks: [{ id: "task-1", status_code: 20100, cost: 0.0012 }] };
  const result = {
    status_code: 20000,
    tasks: [{
      id: "task-1",
      status_code: 20000,
      status_message: "Ok.",
      result: [{
        item_types: ["ai_overview"],
        items: [{
          type: "ai_overview",
          markdown: "한국어 답변 [예시](https://example.com/a)",
          items: [{
            type: "ai_overview_element",
            text: "중복되지 않는 하위 본문",
            references: [
              { type: "ai_overview_reference", source: "예시", domain: "example.com", url: "https://example.com/a#part" },
              { type: "ai_overview_reference", source: "둘째", domain: "example.org", url: "https://example.org/b" },
            ],
          }],
        }],
      }],
    }],
  };

  const normalized = normalizeResult({ surface: "google_aio", submission, result });
  assert.equal(normalized.taskStatus, "succeeded");
  assert.equal(normalized.aiAnswerStatus, "present");
  assert.equal(normalized.answer, "한국어 답변 [예시](https://example.com/a)");
  assert.equal(normalized.providerTaskId, "task-1");
  assert.equal(normalized.actualCostUsd, 0.0012);
  assert.deepEqual(normalized.citations.map(({ order, url }) => ({ order, url })), [
    { order: 1, url: "https://example.com/a" },
    { order: 2, url: "https://example.org/b" },
  ]);
});

test("성공 응답에 AI 요소가 없으면 absent로 구분한다", () => {
  const normalized = normalizeResult({
    surface: "google_aio",
    submission: { tasks: [{ id: "task-2", status_code: 20100, cost: 0.0006 }] },
    result: { status_code: 20000, tasks: [{ id: "task-2", status_code: 20000, result: [{ item_types: [], items: [] }] }] },
  });
  assert.equal(normalized.taskStatus, "succeeded");
  assert.equal(normalized.aiAnswerStatus, "absent");
  assert.equal(normalized.answer, null);
});

test("Provider 실패를 AI 답변 부재로 기록하지 않는다", () => {
  const normalized = normalizeResult({
    surface: "google_ai_mode",
    submission: { tasks: [{ id: "task-3", status_code: 20100, cost: 0.0012 }] },
    result: { status_code: 20000, tasks: [{ id: "task-3", status_code: 40501, status_message: "Task failed.", result: null }] },
  });
  assert.equal(normalized.taskStatus, "failed");
  assert.equal(normalized.aiAnswerStatus, "unknown");
});
