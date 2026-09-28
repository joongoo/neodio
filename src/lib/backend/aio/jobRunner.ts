import { ChildProcess, spawnSync } from "node:child_process";
import { runAioCollection } from "./collector";
import { AioCollectJob } from "./jobTypes";

// 화면의 "지금 수집" — 서버 프로세스 안에서 runAioCollection을 돌리고
// 진행 상태를 메모리에 둔다(수집 로그의 collectionJobRunner와 같은 전제:
// 로컬에서 한 프로세스로 도는 대시보드). 수집기가 쓰는 Chrome 디버그
// 포트가 하나라 동시에 한 작업만 허용한다. 모듈이 라우트마다 따로 로드돼도
// 같은 상태를 보도록 globalThis에 둔다.
interface RunnerState {
  jobs: Map<string, AioCollectJob>;
  children: Map<string, ChildProcess>;
  cancelled: Set<string>;
}

const STATE_KEY = Symbol.for("neodio.aioCollectJobs");
const state: RunnerState = ((globalThis as Record<symbol, unknown>)[STATE_KEY] as RunnerState | undefined) ?? {
  jobs: new Map(),
  children: new Map(),
  cancelled: new Set(),
};
(globalThis as Record<symbol, unknown>)[STATE_KEY] = state;

// 여러 키워드를 연달아 수집할 때 요청 사이 간격. 정기 수집(3~8분)보다 짧게
// 잡되, Phase 0에서 캡차가 뜬 20~40초보다는 길게.
const MANUAL_MIN_DELAY_MS = 60_000;
const MANUAL_MAX_DELAY_MS = 120_000;

export function getAioJob(id: string): AioCollectJob | undefined {
  return state.jobs.get(id);
}

export function getRunningAioJob(): AioCollectJob | undefined {
  return [...state.jobs.values()].find((job) => job.status === "running");
}

/** 가장 최근 작업(진행 중이거나, 끝났어도 방금 끝난 것) — 새로고침 후 이어 보기용. */
export function getLatestAioJob(brandId: string): AioCollectJob | undefined {
  return [...state.jobs.values()].filter((job) => job.brandId === brandId).sort((a, b) => b.startedAt - a.startedAt)[0];
}

// 수집기(node)를 죽이면 그 수집기가 띄운 Chrome도 같이 내려가야 한다.
// Windows는 taskkill /T로 프로세스 트리째, 그 외는 SIGTERM(수집기가 받아서
// 자기 Chrome을 정리하고 끝난다 — collect-google-aio.mjs).
function killChild(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

export function cancelAioJob(id: string): boolean {
  const job = state.jobs.get(id);
  if (!job || job.status !== "running") return false;
  state.cancelled.add(id);
  const child = state.children.get(id);
  if (child) killChild(child);
  return true;
}

export function startAioJob(params: { brandId: string; keywordIds?: string[]; label: string; force: boolean }): AioCollectJob {
  const job: AioCollectJob = {
    id: `aiojob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brandId: params.brandId,
    label: params.label,
    status: "running",
    total: 0,
    current: null,
    waitUntil: null,
    results: [],
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  state.jobs.set(job.id, job);

  runAioCollection({
    brandId: params.brandId,
    keywordIds: params.keywordIds,
    force: params.force,
    minDelayMs: MANUAL_MIN_DELAY_MS,
    maxDelayMs: MANUAL_MAX_DELAY_MS,
    shouldStop: () => state.cancelled.has(job.id),
    onChild: (child) => {
      if (child) state.children.set(job.id, child);
      else state.children.delete(job.id);
    },
    onEvent: (event) => {
      if (event.type === "plan") job.total = event.total;
      if (event.type === "wait") {
        job.current = null;
        job.waitUntil = Date.now() + event.ms;
      }
      if (event.type === "start") {
        job.current = { keyword: event.keyword, device: event.device };
        job.waitUntil = null;
      }
      if (event.type === "result") {
        job.current = null;
        job.results.push({
          keyword: event.keyword,
          device: event.device,
          status: event.status,
          captcha: event.captcha,
          sources: event.sources,
          youtube: event.youtube,
          ownPositions: event.ownPositions,
          message: event.message,
        });
      }
    },
  })
    .then((summary) => {
      if (summary.skippedReason) {
        job.status = "error";
        job.error = summary.skippedReason;
      } else if (summary.stopped || state.cancelled.has(job.id)) job.status = "cancelled";
      else if (summary.captcha) job.status = "captcha";
      else job.status = "done";
    })
    .catch((error) => {
      job.status = state.cancelled.has(job.id) ? "cancelled" : "error";
      job.error = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      job.current = null;
      job.waitUntil = null;
      job.finishedAt = Date.now();
      state.cancelled.delete(job.id);
      state.children.delete(job.id);
    });

  return job;
}
