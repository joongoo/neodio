#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_A_PLAN } from "./config.mjs";
import { normalizeResult } from "./normalize.mjs";

const directory = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!directory) {
  console.error("사용법: node scripts/dataforseo-poc/replay.mjs .tmp/dataforseo-stage-a/<run-id>");
  process.exit(1);
}

const load = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));

for (const task of STAGE_A_PLAN.tasks) {
  const submission = await load(`${task.surface}-post.json`);
  const result = await load(`${task.surface}-get-latest.json`);
  const saved = await load(`${task.surface}-normalized.json`);
  const replayed = normalizeResult({ surface: task.surface, submission, result });
  assert.deepEqual(replayed, saved, `${task.surface} 재생성 결과가 저장된 정규화 결과와 다릅니다.`);
  console.log(`${task.surface}: 원본 JSON 재생성 일치`);
}
