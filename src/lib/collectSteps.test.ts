import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCollectSteps, countBySurface, resumeSerpApiSteps } from "./collectSteps";

const rows = [
  { prompt: "A", promptId: "pa", surfaces: ["naver-ai", "google-ai-mode"] as const },
  { prompt: "B", promptId: "pb", surfaces: ["naver-ai"] as const },
  { prompt: "C", promptId: "pc", surfaces: ["google-aio", "google-ai-mode"] as const },
  { prompt: "D", promptId: "pd", surfaces: ["google-aio"] as const },
  { prompt: "E" }, // 플랫폼 정보가 없는 행 → 기존 기본값(네이버·구글 AI 모드)
].map((r) => ({ ...r, surfaces: r.surfaces ? [...r.surfaces] : undefined }));

test("counts selected prompts per saved surface", () => {
  assert.deepEqual(countBySurface(rows), { "google-aio": 2, "google-ai-mode": 3, "naver-aio": 0, "naver-ai": 3, gemini: 0 });
});

test("steps are lane-pure (naver / google AI mode / AIO) so they can run at the same time", () => {
  const all = new Set(["naver-ai", "google-ai-mode", "google-aio"] as const);
  assert.deepEqual(buildCollectSteps(rows, all), [
    { kind: "ai", engines: ["naver"], keywords: ["A", "B", "E"] },
    { kind: "ai", engines: ["google"], keywords: ["A", "C", "E"] },
    { kind: "aio", promptIds: ["pc", "pd"] },
  ]);
});

test("unchecked surfaces are skipped, and a prompt only left with unchecked surfaces disappears", () => {
  assert.deepEqual(buildCollectSteps(rows, new Set(["google-aio"] as const)), [{ kind: "aio", promptIds: ["pc", "pd"] }]);
  assert.deepEqual(buildCollectSteps(rows, new Set(["naver-ai"] as const)), [{ kind: "ai", engines: ["naver"], keywords: ["A", "B", "E"] }]);
  assert.deepEqual(buildCollectSteps(rows, new Set()), []);
});

test("naver-aio maps to the overview engine and gemini is its own step after AIO", () => {
  const extra = [
    { prompt: "N", promptId: "pn", surfaces: ["naver-aio", "naver-ai", "gemini"] as ("naver-aio" | "naver-ai" | "gemini")[] },
    { prompt: "G", promptId: "pg", surfaces: ["gemini"] as "gemini"[] },
  ];
  const all = new Set(["naver-aio", "naver-ai", "gemini", "google-aio"] as const);
  assert.deepEqual(buildCollectSteps(extra, all), [
    { kind: "ai", engines: ["naver-overview", "naver"], keywords: ["N"] },
    { kind: "gemini", keywords: ["N", "G"] },
  ]);
  assert.deepEqual(buildCollectSteps(extra, new Set(["gemini"] as const)), [{ kind: "gemini", keywords: ["N", "G"] }]);
});

test("SERP API surfaces become separate reservation steps while other surfaces keep their collector lanes", () => {
  const selected = [
    { prompt: "A", promptId: "pa", surfaces: ["google-aio", "google-ai-mode", "naver-ai"] as const },
    { prompt: "B", promptId: "pb", surfaces: ["naver-aio", "naver-ai"] as const },
  ].map((row) => ({ ...row, surfaces: [...row.surfaces] }));
  const enabled = new Set(["google-aio", "google-ai-mode", "naver-aio", "naver-ai"] as const);
  const serpApi = new Set(["google-ai-mode", "naver-aio"] as const);
  assert.deepEqual(buildCollectSteps(selected, enabled, serpApi, "batch-1"), [
    { kind: "ai", engines: ["naver"], keywords: ["A", "B"], requestId: "batch-1" },
    { kind: "aio", promptIds: ["pa"], requestId: "batch-1" },
    { kind: "serp-api", surface: "google-ai-mode", prompts: [{ promptId: "pa", query: "A" }], requestId: "batch-1" },
    { kind: "serp-api", surface: "naver-aio", prompts: [{ promptId: "pb", query: "B" }], requestId: "batch-1" },
  ]);
  const forced = buildCollectSteps(selected, enabled, serpApi, "batch-2", true);
  assert.equal(forced.filter((step) => step.kind === "serp-api").every((step) => step.force === true), true);
});

test("미완료 SERP API 작업을 수집 묶음과 표면별로 복원한다", () => {
  assert.deepEqual(resumeSerpApiSteps([
    { id: "ptask-1", surface: "google-aio", scheduledWindow: "manual:batch-1" },
    { id: "ptask-2", surface: "google-aio", scheduledWindow: "manual:batch-1" },
    { id: "ptask-3", surface: "naver-aio", scheduledWindow: "manual:batch-1" },
    { id: "ptask-4", surface: "google-aio", scheduledWindow: "manual:batch-2" },
  ]), [
    { kind: "serp-api", surface: "google-aio", prompts: [], requestId: "batch-1", taskIds: ["ptask-1", "ptask-2"] },
    { kind: "serp-api", surface: "naver-aio", prompts: [], requestId: "batch-1", taskIds: ["ptask-3"] },
    { kind: "serp-api", surface: "google-aio", prompts: [], requestId: "batch-2", taskIds: ["ptask-4"] },
  ]);
});

 test("SERP steps carry selected devices without changing local collection", () => {
  const surfaces = new Set(["google-aio", "google-ai-mode", "naver-aio"] as const);
  const input = [{prompt: "query", promptId: "p", surfaces: [...surfaces]}];
  for (const devices of [["mobile"], ["desktop", "mobile"]] as ("desktop" | "mobile")[][]) {
    const steps = buildCollectSteps(input, surfaces, surfaces, "request", false, devices);
    assert.equal(steps.length, 3);
    for (const step of steps) { assert.equal(step.kind, "serp-api"); if(step.kind === "serp-api") assert.deepEqual(step.devices, devices); }
  }
  assert.deepEqual(buildCollectSteps(input, new Set(["google-aio"]), new Set(), "manual", false, ["mobile"]), [{kind: "aio", promptIds: ["p"]}]);
});
