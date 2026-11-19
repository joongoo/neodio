import assert from "node:assert/strict";
import test from "node:test";
import { collectionDurationLabel, type CollectionDuration } from "./collectionDuration";

test("durations use elapsed wall time, stable finish and explicit missing/pending labels", () => {
  const timing: CollectionDuration = { hasItems: true, finished: true, startedAt: "2026-11-19T00:00:00Z", completedAt: "2026-11-19T01:02:03Z", measuredAt: "2026-11-20T00:00:00Z" };
  assert.equal(collectionDurationLabel(timing), "1시간 2분 3초");
  assert.equal(collectionDurationLabel({ ...timing, finished: false, completedAt: null, measuredAt: "2026-11-19T00:00:05Z" }), "5초 (진행 중)");
  assert.equal(collectionDurationLabel({ ...timing, hasItems: false }), "-");
  assert.equal(collectionDurationLabel({ ...timing, startedAt: null, finished: false }), "시작 대기");
  assert.equal(collectionDurationLabel({ ...timing, completedAt: null }), "기록 없음");
  assert.equal(collectionDurationLabel({ ...timing, completedAt: "invalid" }), "기록 없음");
});
