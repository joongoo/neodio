import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { NextRequest } from "next/server";

// 수집 대기열(운영에서 누른 수집 → 수집 PC 워커) — 실제 Postgres, 이 파일 전용
// 스키마, 임시 작업 디렉터리(수집 파일 위치가 process.cwd() 기준). 워커처럼
// NEODIO_SKIP_FILE_SYNC=1로 띄워 이 PC의 예전 수집 파일이 들어가지 않는지도 본다.
const baseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!baseUrl) throw new Error("POSTGRES_URL is required to run collection queue tests — see docs/database.md");
const schema = `test_queue_${randomUUID().replaceAll("-", "_")}`;
const scopedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
process.env.POSTGRES_URL = scopedUrl;
process.env.POSTGRES_URL_NON_POOLING = scopedUrl;
process.env.NEODIO_SKIP_FILE_SYNC = "1";
process.env.NEODIO_COLLECTION_MODE = "queue";

const originalCwd = process.cwd();
const workDir = mkdtempSync(path.join(os.tmpdir(), "neodio-queue-"));
let db: typeof import("./database");
let queue: typeof import("./collectionQueue");
let startRoute: typeof import("../../app/api/collection-runs/start/route");
let statusRoute: typeof import("../../app/api/collection-runs/status/route");
let cancelRoute: typeof import("../../app/api/collection-runs/cancel/route");

function writeRun(filename: string, runId: string, query: string, collectionJobId?: string, mtime?: Date) {
  const dir = path.join(workDir, ".tmp", "naver-ai");
  mkdirSync(dir, { recursive: true });
  const promptRun = {
    id: runId,
    promptId: "manual",
    llmModelId: "model-naver-ai",
    marketId: "market-kr",
    runAt: "2026-09-29T00:00:00.000Z",
    status: "success",
    rawResponse: "answer",
    rawMetadata: { source: "naver-ai", query, collectionJobId },
  };
  const file = path.join(dir, filename);
  writeFileSync(file, JSON.stringify({ promptRun }));
  if (mtime) utimesSync(file, mtime, mtime);
}

const post = (pathname: string, body: unknown) =>
  new NextRequest(`http://localhost${pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

before(async () => {
  const setup = new Pool({ connectionString: baseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  process.chdir(workDir);
  // 워커를 켜기 전부터 이 PC에 있던 수집 파일 — 운영 DB에 들어가면 안 된다.
  writeRun("old.json", "run-old", "예전 테스트 수집");
  db = await import("./database");
  queue = await import("./collectionQueue");
  startRoute = await import("../../app/api/collection-runs/start/route");
  statusRoute = await import("../../app/api/collection-runs/status/route");
  cancelRoute = await import("../../app/api/collection-runs/cancel/route");
});

after(async () => {
  process.chdir(originalCwd);
  await (await db.getPromptStore()).close();
  rmSync(workDir, { recursive: true, force: true });
  const cleanup = new Pool({ connectionString: baseUrl });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.end();
});

test("queue mode: start enqueues every keyword, workers claim in order once each", async () => {
  const store = await db.getPromptStore();
  assert.deepEqual(await store.runs("neodigm"), [], "the worker's store init must not import files already on this PC");

  const bad = await startRoute.POST(post("/api/collection-runs/start", { keywords: ["x"], engines: [] }));
  assert.equal(bad.status, 400);
  const res = await startRoute.POST(post("/api/collection-runs/start", { keywords: ["CRM 추천", " ", "영업 관리 툴"], engines: ["naver"] }));
  const body = await res.json();
  assert.equal(body.queued, true);
  assert.equal(body.jobIds.length, 2);

  const queued = await db.getPersistedCollectionJob(body.jobIds[0]);
  assert.deepEqual([queued?.stage, queued?.runner, queued?.keyword], ["queued", "worker", "CRM 추천"]);

  const first = await queue.claimNextCollectionJob("pc-a");
  const second = await queue.claimNextCollectionJob("pc-b");
  assert.deepEqual([first?.id, second?.id], body.jobIds, "oldest first, one worker per job");
  assert.equal(first?.stage, "install");
  assert.equal(await queue.claimNextCollectionJob("pc-a"), null);
});

test("worker liveness: heartbeat keeps a running job alive, silence marks it failed; queued jobs wait", async () => {
  const store = await db.getPromptStore();
  const [job] = await queue.enqueueCollectionJobs("neodigm", ["하트비트 확인"], ["naver"]);
  assert.equal((await db.getPersistedCollectionJob(job.id))?.stage, "queued", "a queued job waits however long it takes");

  assert.equal(await queue.isCollectionWorkerOnline(), false);
  const claimed = (await queue.claimNextCollectionJob("pc-a"))!;
  await queue.recordWorkerHeartbeat("pc-a", claimed.id);
  assert.equal(await queue.isCollectionWorkerOnline(), true);
  assert.equal((await db.getPersistedCollectionJob(claimed.id))?.stage, "install");

  await store.query("UPDATE collection_jobs SET heartbeat_at=$2 WHERE id=$1", [claimed.id, new Date(Date.now() - db.WORKER_STALE_MS - 1000).toISOString()]);
  const stale = await db.getPersistedCollectionJob(claimed.id);
  assert.equal(stale?.stage, "error");
  assert.match(stale?.error ?? "", /수집 PC와 연결이 끊겨/);

  await queue.removeWorker("pc-a");
  await queue.removeWorker("pc-b");
  assert.equal(await queue.isCollectionWorkerOnline(), false);
});

test("cancel: queued jobs cancel at once and are never claimed; running jobs get a request", async () => {
  const [waiting, running] = await queue.enqueueCollectionJobs("neodigm", ["대기 중 취소", "실행 중 취소"], ["google"]);
  const res = await cancelRoute.POST(post("/api/collection-runs/cancel", { jobIds: [waiting.id] }));
  assert.equal(res.status, 200);
  assert.equal((await db.getPersistedCollectionJob(waiting.id))?.stage, "cancelled");

  const claimed = await queue.claimNextCollectionJob("pc-a");
  assert.equal(claimed?.id, running.id, "the cancelled job is skipped");
  assert.equal(await queue.isCollectionCancelRequested(running.id), false);
  assert.equal(await queue.requestCollectionCancel(running.id), "requested");
  assert.equal(await queue.isCollectionCancelRequested(running.id), true);
  assert.equal((await db.getPersistedCollectionJob(running.id))?.stage, "install", "the worker decides when it actually stops");

  assert.equal(await queue.requestCollectionCancel(waiting.id), null, "already finished");
  assert.equal((await cancelRoute.POST(post("/api/collection-runs/cancel", { jobId: "job-missing" }))).status, 404);
});

test("the worker imports only its own job's files; status reports several jobs and worker presence", async () => {
  const store = await db.getPromptStore();
  const [job] = await queue.enqueueCollectionJobs("neodigm", ["워커 수집"], ["naver"]);
  writeRun("mine.json", "run-mine", "워커 수집", job.id);
  writeRun("other.json", "run-other", "다른 작업", "job-someone-else");
  writeRun("stale-mine.json", "run-stale", "워커 수집", job.id, new Date(job.startedAt - 60_000));

  const imported = await db.syncCollectedFiles(store, { jobId: job.id, modifiedSince: job.startedAt });
  assert.equal(imported, 1);
  assert.deepEqual((await store.runs("neodigm")).map((r) => r.promptRun.id), ["run-mine"]);
  const [row] = await store.query<{ job_id: string }>("SELECT job_id FROM prompt_runs WHERE id='run-mine'");
  assert.equal(row.job_id, job.id);

  const res = await statusRoute.GET(new NextRequest(`http://localhost/api/collection-runs/status?jobIds=${job.id},job-missing`));
  const body = await res.json();
  assert.deepEqual(body.jobs.map((j: { jobId: string; stage: string; runner: string }) => [j.jobId, j.stage, j.runner]), [[job.id, "queued", "worker"]]);
  assert.equal(body.workerOnline, false);
});
