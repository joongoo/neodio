import assert from "node:assert/strict";
import test from "node:test";
import { legacyRetrySteps } from "./legacyRetrySteps";

test("retry steps contain only explicit legacy engines and exact AIO prompt/device targets", () => {
  const steps = legacyRetrySteps([
    { query: "A", surface: "google-aio", device: "mobile", promptId: "p-a" },
    { query: "B", surface: "google-aio", device: "desktop", promptId: "p-b" },
    { query: "A", surface: "naver-ai", device: "desktop" },
    { query: "A", surface: "google-ai-mode", device: "desktop" },
  ], "retry-1");
  assert.equal(steps.some(step => step.kind === "serp-api"), false);
  assert.equal(steps.every(step => step.requestId === "retry-1"), true);
  assert.deepEqual(steps.find(step => step.kind === "aio")?.targets, [{ promptId: "p-a", device: "mobile" }, { promptId: "p-b", device: "desktop" }]);
  assert.deepEqual(steps.filter(step => step.kind === "ai").map(step => step.engines), [["naver"], ["google"]]);
});
