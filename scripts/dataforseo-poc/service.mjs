import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertTaskAccepted, DataForSeoClient, firstTask, isTaskComplete, isTaskFailure } from "./client.mjs";
import { buildTaskPayload, STAGE_A_PLAN } from "./config.mjs";
import { normalizeResult } from "./normalize.mjs";

const ROOT = path.resolve(".tmp", "dataforseo-stage-a");
const ACTIVE_WINDOW_MS = 60_000;
let lastStartedAt = 0;

function runId() {
  return `stage-a-${new Date().toISOString().replaceAll(":", "-").replace(".", "-")}`;
}

function runDirectory(id) {
  if (!/^stage-a-[\w.-]+$/.test(id)) throw new Error("올바르지 않은 Stage A 실행 ID입니다.");
  return path.join(ROOT, id);
}

async function saveJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function credentials() {
  return {
    login: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD,
  };
}

export function stageAReadiness() {
  const auth = credentials();
  return {
    enabled: process.env.DATAFORSEO_STAGE_A_ENABLED === "true",
    credentialsReady: Boolean(auth.login && auth.password),
    localOnly: true,
  };
}

export function publicStageAPlan() {
  return {
    query: STAGE_A_PLAN.query,
    locationName: STAGE_A_PLAN.locationName,
    languageCode: STAGE_A_PLAN.languageCode,
    device: STAGE_A_PLAN.device,
    taskCount: STAGE_A_PLAN.tasks.length,
    estimatedMaxCostUsd: STAGE_A_PLAN.estimatedMaxCostUsd,
    stageBudgetUsd: STAGE_A_PLAN.stageBudgetUsd,
    surfaces: STAGE_A_PLAN.tasks.map(({ surface, estimatedMaxCostUsd }) => ({ surface, estimatedMaxCostUsd })),
  };
}

export async function startStageA(query) {
  const readiness = stageAReadiness();
  if (!readiness.enabled) throw new Error("DATAFORSEO_STAGE_A_ENABLED=true 설정 후 실행할 수 있습니다.");
  if (!readiness.credentialsReady) throw new Error("DataForSEO API 인증정보가 설정되지 않았습니다.");
  if (process.env.VERCEL) throw new Error("Stage A 원본 파일 보존을 위해 로컬 개발 환경에서만 실행할 수 있습니다.");
  if (Date.now() - lastStartedAt < ACTIVE_WINDOW_MS) throw new Error("중복 제출 방지를 위해 1분 후 다시 시도해주세요.");
  lastStartedAt = Date.now();

  const id = runId();
  const directory = runDirectory(id);
  await mkdir(directory, { recursive: true });
  const state = {
    runId: id,
    query,
    createdAt: new Date().toISOString(),
    estimatedMaxCostUsd: STAGE_A_PLAN.estimatedMaxCostUsd,
    actualCostUsd: 0,
    status: "submitting",
    tasks: [],
  };
  await saveJson(path.join(directory, "plan.json"), { ...publicStageAPlan(), query, runId: id, createdAt: state.createdAt });
  await saveJson(path.join(directory, "state.json"), state);

  const client = new DataForSeoClient(credentials());
  try {
    for (const task of STAGE_A_PLAN.tasks) {
      const payload = [buildTaskPayload(task, id, query)];
      await saveJson(path.join(directory, `${task.surface}-request.json`), payload);
      const submission = await client.post(task.postPath, payload);
      await saveJson(path.join(directory, `${task.surface}-post.json`), submission);
      const accepted = assertTaskAccepted(submission);
      state.tasks.push({
        surface: task.surface,
        providerTaskId: accepted.id,
        status: "queued",
        costUsd: Number(accepted.cost ?? 0),
      });
      state.actualCostUsd += Number(accepted.cost ?? 0);
      await saveJson(path.join(directory, "state.json"), state);
    }
    state.status = "queued";
  } catch (error) {
    state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
  }
  await saveJson(path.join(directory, "state.json"), state);
  return state;
}

export async function checkStageA(id) {
  const readiness = stageAReadiness();
  if (!readiness.credentialsReady) throw new Error("DataForSEO API 인증정보가 설정되지 않았습니다.");
  const directory = runDirectory(id);
  const state = await loadJson(path.join(directory, "state.json"));
  if (state.status === "failed" || state.status === "succeeded") return state;

  const client = new DataForSeoClient(credentials());
  const normalized = [];
  let pending = false;
  let failed = false;

  for (const taskState of state.tasks) {
    const task = STAGE_A_PLAN.tasks.find((candidate) => candidate.surface === taskState.surface);
    if (!task) continue;
    if (taskState.status === "succeeded" || taskState.status === "failed") {
      const normalizedPath = path.join(directory, `${task.surface}-normalized.json`);
      try { normalized.push(await loadJson(normalizedPath)); } catch { /* 다음 조회에서 다시 생성 */ }
      failed ||= taskState.status === "failed";
      continue;
    }

    const response = await client.get(`${task.getPath}/${taskState.providerTaskId}`);
    await saveJson(path.join(directory, `${task.surface}-get-latest.json`), response);
    const providerTask = firstTask(response);
    if (isTaskFailure(providerTask)) {
      taskState.status = "failed";
      taskState.providerStatusCode = providerTask.status_code;
      taskState.providerStatusMessage = providerTask.status_message;
      failed = true;
      continue;
    }
    if (!isTaskComplete(providerTask)) {
      taskState.status = "running";
      pending = true;
      continue;
    }

    const submission = await loadJson(path.join(directory, `${task.surface}-post.json`));
    const item = normalizeResult({ surface: task.surface, submission, result: response });
    await saveJson(path.join(directory, `${task.surface}-normalized.json`), item);
    normalized.push(item);
    taskState.status = item.taskStatus;
    failed ||= item.taskStatus === "failed";
  }

  state.status = pending ? "running" : failed ? "failed" : "succeeded";
  state.checkedAt = new Date().toISOString();
  if (!pending) {
    state.completedAt = state.checkedAt;
    state.results = normalized;
    await saveJson(path.join(directory, "summary.json"), state);
  }
  await saveJson(path.join(directory, "state.json"), state);
  return state;
}
