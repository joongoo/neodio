import { spawn } from "node:child_process";
import { CollectionJob } from "./collectionJobTypes";

// In-memory job store — this dashboard runs as a single local dev process,
// so a Map survives exactly as long as a running job needs it. Restarting
// `next dev` loses in-flight jobs, which is fine: the underlying collector
// scripts are idempotent CLI runs the user can just trigger again.
const jobs = new Map<string, CollectionJob>();
const isWindows = process.platform === "win32";

function runCommand(command: string, args: string[], onLog: (line: string) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: isWindows });
    child.stdout?.on("data", (chunk) => onLog(chunk.toString()));
    child.stderr?.on("data", (chunk) => onLog(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

function appendLog(job: CollectionJob, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) job.log.push(trimmed);
  }
  if (job.log.length > 200) job.log = job.log.slice(-200);
}

export function getJob(id: string): CollectionJob | undefined {
  return jobs.get(id);
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

  runJob(job).catch((error) => {
    job.stage = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
  });

  return job;
}

// Every stage below is a real step, not a simulated delay: "설치 확인" runs
// `playwright install` (a no-op if already installed, so a fresh machine
// bootstraps itself on first use, per-engine collection shells out to the
// same npm scripts a person would run from a terminal, and "저장 중" runs
// process-raw.ts so mentions/citations are recomputed immediately.
async function runJob(job: CollectionJob) {
  job.stage = "install";
  appendLog(job, "Playwright 브라우저 설치 확인 중...");
  const npx = isWindows ? "npx.cmd" : "npx";
  const installCode = await runCommand(npx, ["playwright", "install", "chromium"], (line) => appendLog(job, line));
  if (installCode !== 0) {
    throw new Error("Playwright 브라우저 설치에 실패했습니다. 로그를 확인해주세요.");
  }

  const npm = isWindows ? "npm.cmd" : "npm";

  if (job.engines.includes("naver")) {
    job.stage = "naver";
    appendLog(job, `네이버 AI검색 수집 시작: "${job.keyword}"`);
    const code = await runCommand(npm, ["run", "collect:naver-ai", "--", "--query", job.keyword], (line) =>
      appendLog(job, line)
    );
    appendLog(job, code === 0 ? "네이버 수집 완료" : "네이버 수집이 실패 상태로 종료되었습니다 (로그 참고).");
  }

  if (job.engines.includes("google")) {
    job.stage = "google";
    appendLog(job, `구글 AI 모드 수집 시작: "${job.keyword}" (시크릿 크롬 창이 열립니다)`);
    const code = await runCommand(npm, ["run", "collect:google-ai", "--", "--query", job.keyword], (line) =>
      appendLog(job, line)
    );
    appendLog(job, code === 0 ? "구글 수집 완료" : "구글 수집이 실패 상태로 종료되었습니다 (로그 참고).");
  }

  job.stage = "save";
  appendLog(job, "수집 결과 저장(가공) 중...");
  await runCommand(npm, ["run", "process:raw"], (line) => appendLog(job, line));

  job.stage = "done";
  job.finishedAt = Date.now();
}

export type { CollectionStage, CollectionJob } from "./collectionJobTypes";
