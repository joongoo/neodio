import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCollectSteps, countBySurface } from "./collectSteps";

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
