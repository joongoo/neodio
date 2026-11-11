#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertTaskAccepted, DataForSeoClient, firstTask, isTaskComplete, isTaskFailure } from "./client.mjs";
import { buildTaskPayload, STAGE_A_PLAN } from "./config.mjs";
import { normalizeResult } from "./normalize.mjs";

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 45 * 60_000;

function argValue(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function money(value) {
  return Number(value).toFixed(4);
}

function timestamp() {
  return new Date().toISOString().replaceAll(":", "-").replace(".", "-");
}

async function saveJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function printPlan(query) {
  console.log("Neodio DataForSEO Stage A 실행 계획");
  console.log(`- 질의: ${query}`);
  console.log(`- 조건: ${STAGE_A_PLAN.languageCode} / ${STAGE_A_PLAN.locationName} / ${STAGE_A_PLAN.device}`);
  for (const task of STAGE_A_PLAN.tasks) {
    console.log(`- ${task.surface}: Standard task 1건, 최대 예상 USD ${money(task.estimatedMaxCostUsd)}`);
  }
  console.log(`- 합계: 2건, 최대 예상 USD ${money(STAGE_A_PLAN.estimatedMaxCostUsd)} / Stage A 한도 USD ${money(STAGE_A_PLAN.stageBudgetUsd)}`);
}

async function pollResult(client, task, taskId, outputDir) {
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    attempt += 1;
    const response = await client.get(`${task.getPath}/${taskId}`);
    await saveJson(path.join(outputDir, `${task.surface}-get-latest.json`), response);
    const providerTask = firstTask(response);
    if (isTaskFailure(providerTask) || isTaskComplete(providerTask)) return response;
    console.log(`[${task.surface}] 대기 중 (${attempt}회, ${providerTask.status_code}: ${providerTask.status_message})`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`${task.surface} 결과가 ${POLL_TIMEOUT_MS / 60_000}분 안에 준비되지 않았습니다.`);
}

async function main() {
  const execute = process.argv.includes("--execute");
  const query = argValue("query", STAGE_A_PLAN.query).trim();
  printPlan(query);
  if (!execute) {
    console.log("\n계획 확인만 수행했습니다. 실제 제출은 --execute --confirm-max-cost=0.0024가 모두 있을 때만 가능합니다.");
    return;
  }

  const confirmed = Number(argValue("confirm-max-cost"));
  if (confirmed !== STAGE_A_PLAN.estimatedMaxCostUsd) {
    throw new Error(`실제 제출에는 --confirm-max-cost=${STAGE_A_PLAN.estimatedMaxCostUsd}가 필요합니다.`);
  }
  if (STAGE_A_PLAN.tasks.length !== 2 || STAGE_A_PLAN.estimatedMaxCostUsd > STAGE_A_PLAN.stageBudgetUsd) {
    throw new Error("Stage A 호출 수 또는 예산 안전장치가 충족되지 않았습니다.");
  }

  const runId = `stage-a-${timestamp()}`;
  const outputDir = path.resolve(argValue("out", path.join(".tmp", "dataforseo-stage-a", runId)));
  await mkdir(outputDir, { recursive: true });
  await saveJson(path.join(outputDir, "plan.json"), { ...STAGE_A_PLAN, query, runId, createdAt: new Date().toISOString() });

  const client = new DataForSeoClient({
    login: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD,
  });
  const completed = [];

  for (const task of STAGE_A_PLAN.tasks) {
    const payload = [buildTaskPayload(task, runId, query)];
    await saveJson(path.join(outputDir, `${task.surface}-request.json`), payload);
    console.log(`[${task.surface}] Standard task 1건 제출`);
    const submission = await client.post(task.postPath, payload);
    await saveJson(path.join(outputDir, `${task.surface}-post.json`), submission);
    const accepted = assertTaskAccepted(submission);
    console.log(`[${task.surface}] task ${accepted.id}, 청구 USD ${money(accepted.cost)}`);
    const result = await pollResult(client, task, accepted.id, outputDir);
    const normalized = normalizeResult({ surface: task.surface, submission, result });
    await saveJson(path.join(outputDir, `${task.surface}-normalized.json`), normalized);
    completed.push(normalized);
  }

  const summary = {
    runId,
    query,
    locationName: STAGE_A_PLAN.locationName,
    languageCode: STAGE_A_PLAN.languageCode,
    device: STAGE_A_PLAN.device,
    taskCount: completed.length,
    estimatedMaxCostUsd: STAGE_A_PLAN.estimatedMaxCostUsd,
    actualCostUsd: completed.reduce((sum, item) => sum + item.actualCostUsd, 0),
    completedAt: new Date().toISOString(),
    results: completed,
  };
  await saveJson(path.join(outputDir, "summary.json"), summary);
  console.log(`\n완료: ${outputDir}`);
  console.log(`실제 제출 비용: USD ${money(summary.actualCostUsd)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
