import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { assertTaskAccepted, DataForSeoClient, firstTask, isTaskComplete, isTaskFailure } from "./client.mjs";
import { buildTaskPayload, STAGE_A_PLAN } from "./config.mjs";
import { normalizeResult } from "./normalize.mjs";

const ROOT = path.resolve(".tmp", "dataforseo-stage-a");
const EXECUTION_LOCK = path.join(ROOT, "first-execution-lock.json");

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
    accessTokenReady: Boolean(process.env.DATAFORSEO_STAGE_A_TOKEN),
    localOnly: true,
  };
}

export function verifyStageAAccessToken(candidate) {
  const expected = process.env.DATAFORSEO_STAGE_A_TOKEN;
  if (!expected || typeof candidate !== "string") return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  return expectedBuffer.length === candidateBuffer.length && timingSafeEqual(expectedBuffer, candidateBuffer);
}

async function reserveFirstExecution(query) {
  await mkdir(ROOT, { recursive: true });
  let handle;
  try {
    handle = await open(EXECUTION_LOCK, "wx");
    await handle.writeFile(`${JSON.stringify({
      reservedAt: new Date().toISOString(),
      query,
      reservedTaskCount: STAGE_A_PLAN.tasks.length,
      reservedMaxCostUsd: STAGE_A_PLAN.estimatedMaxCostUsd,
      stageBudgetUsd: STAGE_A_PLAN.stageBudgetUsd,
    }, null, 2)}\n`, "utf8");
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("최초 Stage A 2건이 이미 예약 또는 실행되어 추가 제출을 차단했습니다.");
    throw error;
  } finally {
    await handle?.close();
  }
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
  if (STAGE_A_PLAN.tasks.length !== 2 || STAGE_A_PLAN.estimatedMaxCostUsd > STAGE_A_PLAN.stageBudgetUsd) {
    throw new Error("Stage A 요청 수 또는 예산 안전장치가 충족되지 않았습니다.");
  }
  await reserveFirstExecution(query);

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
    state.status = state.tasks.length ? "queued" : "failed";
    state.submissionError = error instanceof Error ? error.message : String(error);
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
  let failed = state.tasks.length !== STAGE_A_PLAN.tasks.length || Boolean(state.submissionError);

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
