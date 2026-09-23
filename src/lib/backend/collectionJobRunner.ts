import { ChildProcess, spawn } from "node:child_process";
import { CollectionJob } from "./collectionJobTypes";
import { getPersistedCollectionJob, getPromptStore, persistCollectionJob, syncCollectedFiles } from "./database";

// In-memory job store — this dashboard runs as a single local dev process,
// so a Map survives exactly as long as a running job needs it. Restarting
// `next dev` loses in-flight jobs, which is fine: the underlying collector
// scripts are idempotent CLI runs the user can just trigger again.
const jobs = new Map<string, CollectionJob>();
// Currently-running child process per job — lets cancelCollectionJob() reach
// in and kill whichever stage (playwright install / naver / google / save)
// happens to be running when the user hits "중단".
const runningChildren = new Map<string, ChildProcess>();
// Cancellation is "requested" here rather than mutating the job object
// directly — runJob checks this after every stage and stops advancing,
// instead of every call site needing to know how to unwind mid-stage.
const cancelledJobs = new Set<string>();
const isWindows = process.platform === "win32";

function runCommand(command: string, args: string[], onLog: (line: string) => void, jobId?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: isWindows,
      env: { ...process.env, NEODIO_COLLECTION_JOB_ID: jobId ?? "" } });
    if (jobId) runningChildren.set(jobId, child);
    child.stdout?.on("data", (chunk) => onLog(chunk.toString()));
    child.stderr?.on("data", (chunk) => onLog(chunk.toString()));
    child.on("error", (error) => {
      if (jobId) runningChildren.delete(jobId);
      reject(error);
    });
    child.on("close", (code) => {
      if (jobId) runningChildren.delete(jobId);
      resolve(code ?? 0);
    });
  });
}

// "중단" 버튼이 부르는 실제 취소 — 지금까지는 프론트에서 다음 순서 진행만
// 멈췄지, 서버에서 돌고 있는 npm/playwright 프로세스는 끝까지 살아있었다.
// SIGTERM으로 현재 단계의 자식 프로세스를 죽이고, runJob이 다음 stage로
// 넘어가기 전에 cancelledJobs를 확인해 즉시 멈추게 한다.
export function cancelCollectionJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.stage === "done" || job.stage === "error" || job.stage === "cancelled") return false;
  cancelledJobs.add(id);
  const child = runningChildren.get(id);
  child?.kill(isWindows ? undefined : "SIGTERM");
  return true;
}

function appendLog(job: CollectionJob, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) job.log.push(trimmed);
  }
  if (job.log.length > 200) job.log = job.log.slice(-200);
}

export async function getJob(id: string): Promise<CollectionJob | undefined> {
  return jobs.get(id) ?? getPersistedCollectionJob(id);
}

export function startCollectionJob(keyword: string, engines: ("naver" | "google")[]): CollectionJob {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: CollectionJob = {
    id,
    keyword,
    engines,
    stage: "install",
    log: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);

  runJob(job).catch(async (error) => {
    job.stage = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
    await persistCollectionJob(job);
  }).catch(error => console.error("Unable to persist collection job", error));

  return job;
}

// Every stage below is a real step, not a simulated delay: "설치 확인" runs
// `playwright install` (a no-op if already installed, so a fresh machine
// bootstraps itself on first use, per-engine collection shells out to the
// same npm scripts a person would run from a terminal, and "저장 중" runs
// process-raw.ts so mentions/citations are recomputed immediately.
async function markCancelled(job: CollectionJob): Promise<void> {
  appendLog(job, "사용자가 수집을 중단했습니다.");
  job.stage = "cancelled";
  job.finishedAt = Date.now();
  cancelledJobs.delete(job.id);
  await persistCollectionJob(job);
}

async function runJob(job: CollectionJob) {
  await persistCollectionJob(job);
  job.stage = "install";
  appendLog(job, "Playwright 브라우저 설치 확인 중...");
  const npx = isWindows ? "npx.cmd" : "npx";
  const installCode = await runCommand(npx, ["playwright", "install", "chromium"], (line) => appendLog(job, line), job.id);
  if (cancelledJobs.has(job.id)) return markCancelled(job);
  if (installCode !== 0) {
    throw new Error("Playwright 브라우저 설치에 실패했습니다. 로그를 확인해주세요.");
  }

  const npm = isWindows ? "npm.cmd" : "npm";
  let collectionFailed = false;

  if (job.engines.includes("naver")) {
    job.stage = "naver";
    await persistCollectionJob(job);
    appendLog(job, `네이버 AI검색 수집 시작: "${job.keyword}"`);
    const code = await runCommand(npm, ["run", "collect:naver-ai", "--", "--query", job.keyword], (line) =>
      appendLog(job, line), job.id
    );
    if (cancelledJobs.has(job.id)) return markCancelled(job);
    appendLog(job, code === 0 ? "네이버 수집 완료" : "네이버 수집이 실패 상태로 종료되었습니다 (로그 참고).");
    collectionFailed ||= code !== 0;
  }

  if (job.engines.includes("google")) {
    job.stage = "google";
    await persistCollectionJob(job);
    appendLog(job, `구글 AI 모드 수집 시작: "${job.keyword}" (시크릿 크롬 창이 열립니다)`);
    const code = await runCommand(npm, ["run", "collect:google-ai", "--", "--query", job.keyword], (line) =>
      appendLog(job, line), job.id
    );
    if (cancelledJobs.has(job.id)) return markCancelled(job);
    appendLog(job, code === 0 ? "구글 수집 완료" : "구글 수집이 실패 상태로 종료되었습니다 (로그 참고).");
    collectionFailed ||= code !== 0;
  }

  job.stage = "save";
  await persistCollectionJob(job);
  appendLog(job, "수집 결과 저장(가공) 중...");
  const store = await getPromptStore();
  await syncCollectedFiles(store);
  const saveCode = await runCommand(npm, ["run", "db:migrate"], (line) => appendLog(job, line), job.id);
  if (cancelledJobs.has(job.id)) return markCancelled(job);
  if (saveCode !== 0) throw new Error("Failed to save collection analysis");
  if (collectionFailed) throw new Error("일부 수집이 실패했습니다. 수집 로그를 확인해주세요.");

  job.stage = "done";
  job.finishedAt = Date.now();
  await persistCollectionJob(job);
}

export type { CollectionStage, CollectionJob } from "./collectionJobTypes";
