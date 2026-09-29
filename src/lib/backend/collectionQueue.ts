import os from "node:os";
import { getPromptStore, persistCollectionJob, WORKER_STALE_MS } from "./database";
import type { CollectionJob } from "./collectionJobTypes";

// 수집 대기열 — 운영(Vercel)에는 실제 Chrome이 없어서 AI검색 수집을 직접 못 돌린다.
// 화면에서 수집을 누르면 여기서 collection_jobs에 "queued"로 기록만 하고, Chrome이
// 있는 수집 PC의 워커(scripts/collection-worker.ts)가 운영 DB를 보고 가져가 실행한
// 뒤 결과를 운영 DB에 넣는다. 진행 상태·취소도 전부 이 테이블을 거친다.

/**
 * 이 서버가 수집을 대기열로 넘기는지. Vercel이면 항상, 로컬에서도
 * NEODIO_COLLECTION_MODE=queue로 켜서 워커 흐름을 그대로 시험할 수 있다.
 */
export function collectionRunsRemotely(): boolean {
  return !!process.env.VERCEL || process.env.NEODIO_COLLECTION_MODE === "queue";
}

export async function enqueueCollectionJobs(organizationId: string, keywords: string[], engines: ("naver" | "google")[]): Promise<CollectionJob[]> {
  const jobs: CollectionJob[] = [];
  const now = Date.now();
  for (const [index, keyword] of keywords.entries()) {
    const job: CollectionJob = {
      id: `job-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      organizationId,
      keyword,
      engines,
      stage: "queued",
      log: [],
      error: null,
      // 대기열 순서 = 시작 시각 순. 같은 요청 안의 순서를 지키도록 1ms씩 민다.
      startedAt: now + index,
      finishedAt: null,
      runner: "worker",
    };
    await persistCollectionJob(job);
    jobs.push(job);
  }
  return jobs;
}

/** 가장 오래된 대기 작업 하나를 이 워커 몫으로 가져온다 — 워커가 여럿이어도 한 작업은 한 워커만. */
export async function claimNextCollectionJob(workerId: string): Promise<CollectionJob | null> {
  const store = await getPromptStore();
  const now = new Date().toISOString();
  const [row] = await store.query<{ data_json: CollectionJob }>(
    `UPDATE collection_jobs SET status='install', heartbeat_at=$2,
       data_json = data_json || jsonb_build_object('stage','install','host',$3::text,'workerId',$1::text)
     WHERE id = (SELECT id FROM collection_jobs WHERE status='queued' AND NOT cancel_requested ORDER BY started_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING data_json`,
    [workerId, now, os.hostname()]
  );
  return row?.data_json ?? null;
}

/**
 * 취소 요청. 아직 대기 중이면 바로 취소로 끝내고("cancelled"), 워커가 실행 중이면
 * 표시만 남겨 워커가 보고 멈추게 한다("requested"). 이미 끝났거나 없으면 null.
 */
export async function requestCollectionCancel(jobId: string): Promise<"cancelled" | "requested" | null> {
  const store = await getPromptStore();
  const finishedAt = Date.now();
  const cancelled = await store.query(
    `UPDATE collection_jobs SET status='cancelled', finished_at=$2, cancel_requested=true,
       data_json = data_json || jsonb_build_object('stage','cancelled','finishedAt',$3::bigint)
     WHERE id=$1 AND status='queued' RETURNING id`,
    [jobId, new Date(finishedAt).toISOString(), finishedAt]
  );
  if (cancelled.length > 0) return "cancelled";
  const requested = await store.query(
    "UPDATE collection_jobs SET cancel_requested=true WHERE id=$1 AND status NOT IN ('done','error','cancelled') RETURNING id",
    [jobId]
  );
  return requested.length > 0 ? "requested" : null;
}

export async function isCollectionCancelRequested(jobId: string): Promise<boolean> {
  const [row] = await (await getPromptStore()).query<{ cancel_requested: boolean }>("SELECT cancel_requested FROM collection_jobs WHERE id=$1", [jobId]);
  return row?.cancel_requested ?? false;
}

/** 워커 신호 — 워커 자체(수집 PC 켜짐 표시)와 실행 중인 작업(끊김 판정)에 같이 남긴다. */
export async function recordWorkerHeartbeat(workerId: string, jobId: string | null): Promise<void> {
  const store = await getPromptStore();
  const now = new Date().toISOString();
  await store.query(
    `INSERT INTO collection_workers (id,host,last_seen_at,current_job_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,current_job_id=EXCLUDED.current_job_id`,
    [workerId, os.hostname(), now, jobId]
  );
  if (jobId) await store.query("UPDATE collection_jobs SET heartbeat_at=$2 WHERE id=$1", [jobId, now]);
}

export async function removeWorker(workerId: string): Promise<void> {
  await (await getPromptStore()).query("DELETE FROM collection_workers WHERE id=$1", [workerId]);
}

/** 최근에 신호를 보낸 워커가 있는지 — 없으면 화면에 "수집 PC 대기 중"을 알린다. */
export async function isCollectionWorkerOnline(): Promise<boolean> {
  const since = new Date(Date.now() - WORKER_STALE_MS).toISOString();
  const rows = await (await getPromptStore()).query("SELECT 1 FROM collection_workers WHERE last_seen_at >= $1 LIMIT 1", [since]);
  return rows.length > 0;
}
