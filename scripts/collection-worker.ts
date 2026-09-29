// AI검색 수집 워커 — 운영(Vercel)에서 누른 수집(프롬프트 라이브러리 "선택 수집",
// 수집 로그의 "수집")은 운영 DB에 대기 작업으로만 기록된다(src/lib/backend/
// collectionQueue.ts). 이 스크립트를 실제 Chrome이 있는 PC에서 켜 두면 대기
// 작업을 하나씩 가져가 로컬과 같은 수집 코드로 실행하고, 그 작업이 만든 결과
// 파일만 운영 DB에 넣는다. 진행 상태·중단 요청도 운영 DB로 주고받는다.
//
//   npm run collect:worker:prod   # 운영 DB(.env.neon.local)의 대기열 처리
//   npm run collect:worker        # 로컬 DB(.env.local) — NEODIO_COLLECTION_MODE=queue로 띄운 로컬 화면과 짝
//
// 옵션: --once  대기열을 비우면 종료(기본은 계속 대기)
import os from "node:os";

// 워커 프로세스의 DB 초기화가 이 PC .tmp의 예전 수집 파일을 통째로 가져오지 않게 한다 —
// getPromptStore()가 처음 불릴 때 읽는다(아래 import들은 모듈 로드 시 DB에 접근하지 않는다).
process.env.NEODIO_SKIP_FILE_SYNC = "1";

import { cancelCollectionJob, runClaimedCollectionJob } from "../src/lib/backend/collectionJobRunner";
import {
  claimNextCollectionJob,
  isCollectionCancelRequested,
  recordWorkerHeartbeat,
  removeWorker,
} from "../src/lib/backend/collectionQueue";
import { getPromptStore } from "../src/lib/backend/database";
import type { CollectionJob } from "../src/lib/backend/collectionJobTypes";

const IDLE_POLL_MS = 10_000;
// 실행 중에는 중단 요청을 자주 확인한다. 신호(heartbeat)는 그보다 드물게.
const CANCEL_CHECK_MS = 3_000;
const HEARTBEAT_EVERY = 5; // CANCEL_CHECK_MS × 5 = 15초

const workerId = `${os.hostname()}-${process.pid}`;
const once = process.argv.includes("--once");
let stopping = false;
let current: CollectionJob | null = null;

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function databaseHost(): string {
  const url = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("POSTGRES_URL이 필요합니다 — npm run collect:worker:prod(운영) 또는 collect:worker(로컬)로 실행하세요.");
  try {
    return new URL(url).hostname;
  } catch {
    return "(알 수 없음)";
  }
}

async function runJob(job: CollectionJob) {
  current = job;
  log(`▶ "${job.keyword}" 수집 시작 (${job.engines.join(", ")}, 조직 ${job.organizationId ?? "-"})`);
  let ticks = 0;
  const timer = setInterval(() => {
    (async () => {
      if (++ticks % HEARTBEAT_EVERY === 0) await recordWorkerHeartbeat(workerId, job.id);
      if (await isCollectionCancelRequested(job.id)) cancelCollectionJob(job.id);
    })().catch((error) => log(`상태 확인 실패: ${error instanceof Error ? error.message : error}`));
  }, CANCEL_CHECK_MS);
  try {
    await recordWorkerHeartbeat(workerId, job.id);
    const finished = await runClaimedCollectionJob(job);
    log(`■ "${job.keyword}" ${finished.stage}${finished.error ? ` — ${finished.error}` : ""}`);
  } finally {
    clearInterval(timer);
    current = null;
  }
}

function onSignal() {
  if (stopping) {
    log("강제 종료합니다.");
    process.exit(1);
  }
  stopping = true;
  if (current) {
    log(`종료 요청 — 실행 중인 "${current.keyword}" 수집을 중단하고 끝냅니다. (한 번 더 누르면 강제 종료)`);
    cancelCollectionJob(current.id);
  } else {
    log("종료 요청 — 대기를 멈춥니다.");
  }
}

async function main() {
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  log(`수집 워커 시작 — ${workerId}, DB ${databaseHost()}${once ? " (--once)" : ""}`);

  while (!stopping) {
    await recordWorkerHeartbeat(workerId, null);
    const job = await claimNextCollectionJob(workerId);
    if (job) {
      await runJob(job);
      continue;
    }
    if (once) break;
    // 종료 신호에 바로 반응하도록 잘게 나눠 기다린다.
    for (let waited = 0; waited < IDLE_POLL_MS && !stopping; waited += 500) await sleep(500);
  }

  await removeWorker(workerId);
  await (await getPromptStore()).close();
  log("수집 워커 종료");
}

main().catch(async (error) => {
  console.error(error);
  await removeWorker(workerId).catch(() => null);
  process.exitCode = 1;
});
