import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PromptStore } from "../database/store";
import { PostgresProviderTaskStore } from "./taskStore";
import { managePendingSerpItems } from "./pendingSelection";
import { LegacyRetryConflict } from "./legacyRetry";
import { cancelCollectionRequest } from "./cancelRequest";

const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;

test("Postgres queue capacity and cancellation races across independent connections", { skip: !connectionString, timeout: 30_000 }, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(connectionString!).hostname), "Only a local Postgres is allowed");
  const namespace = `dfs_queue_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(namespace, /^dfs_queue_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString, max: 1 });
  const stores: PromptStore[] = [];
  try {
    // Only these empty tables in a unique disposable schema are written.
    await admin.query(`CREATE SCHEMA ${namespace}`);
    await admin.query(`CREATE TABLE ${namespace}.provider_tasks (LIKE public.provider_tasks INCLUDING DEFAULTS);
      CREATE TABLE ${namespace}.collection_requests (LIKE public.collection_requests INCLUDING DEFAULTS);
      CREATE TABLE ${namespace}.legacy_collection_items (LIKE public.legacy_collection_items INCLUDING DEFAULTS)`);
    for (let i = 0; i < 2; i++) stores.push(new PromptStore(new Pool({ connectionString, max: 1,
      options: `-c search_path=${namespace},pg_catalog -c statement_timeout=5000 -c lock_timeout=4000` })));
    const [a, b] = stores;
    for (const db of stores) assert.equal((await db.query<{ schema: string }>("SELECT current_schema() AS schema"))[0].schema, namespace);
    const taskA = new PostgresProviderTaskStore(async () => a);
    const taskB = new PostgresProviderTaskStore(async () => b);
    const reset = async () => {
      await a.query(`DELETE FROM provider_tasks; DELETE FROM collection_requests;
        INSERT INTO collection_requests(id,organization_id,brand_id,request_kind,status,created_at,updated_at,approved_at)
        VALUES ('request','org','brand','manual','queued','2026-11-18','2026-11-18','2026-11-18');
        INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,provider,surface,device,market_id,query_snapshot,scheduled_window,dedupe_key,endpoint,tag,status,created_at,updated_at)
        SELECT 'task-'||n,'org','brand','request','dataforseo','google-aio','desktop','market-kr','query','manual:test','dedupe-'||n,'test','tag-'||n,'reserved','2026-11-18','2026-11-18' FROM generate_series(1,2) n`);
    };
    const claim = (owner: string) => ({ owner, limit: 2, maxInFlight: 1, leaseMs: 60_000, organizationId: "org" });
    const pidB = (await b.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))[0].pid;
    const waitForLock = async () => {
      for (let i = 0; i < 100; i++) {
        const result = await admin.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'", [pidB]);
        if (result.rowCount) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail("Second DB connection did not wait for the first transaction lock");
    };

    await t.test("two workers cannot exceed one shared slot or own the same reservation", async () => {
      await reset();
      const [first, second] = await Promise.all([taskA.claimReserved(claim("a")), taskB.claimReserved(claim("b"))]);
      assert.equal(first.length + second.length, 1);
      assert.equal((await a.query("SELECT id FROM provider_tasks WHERE lease_owner IS NOT NULL")).length, 1);
      assert.equal((await a.query("SELECT id FROM provider_tasks")).length, 2);
    });

    await t.test("worker wins: concurrent batch cancel waits then rejects without partial cancellation", async () => {
      await reset();
      let release!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { ready = resolve; });
      const worker = a.transaction(async () => { const claimed = await taskA.claimReserved(claim("worker")); ready(); await gate; return claimed; });
      await started;
      const cancellation = managePendingSerpItems("org", "brand", "request", ["task-1", "task-2"], "cancel", b).then(value => ({ value, error: null }), error => ({ value: null, error }));
      try { await waitForLock(); } finally { release(); }
      assert.equal((await worker).length, 1);
      assert.ok((await cancellation).error instanceof LegacyRetryConflict);
      assert.equal((await a.query("SELECT id FROM provider_tasks WHERE status='reserved'")).length, 2);
    });

    await t.test("cancel wins: worker skips locked rows and cannot submit after commit", async () => {
      await reset();
      await a.transaction(async () => {
        assert.equal((await managePendingSerpItems("org", "brand", "request", ["task-1", "task-2"], "cancel", a))?.count, 2);
        assert.equal((await taskB.claimReserved(claim("worker"))).length, 0);
      });
      assert.equal((await taskB.claimReserved(claim("restart"))).length, 0);
      assert.equal(await taskB.beginSubmission("task-1", "restart", new Date().toISOString()), null);
      assert.equal((await a.query("SELECT id FROM provider_tasks WHERE status='cancelled'")).length, 2);
      assert.equal((await a.query("SELECT id FROM provider_tasks")).length, 2, "Cancellation preserves both records");
    });

    await t.test("whole-request cancellation fences a claimed worker before POST, including concurrent attempts", async () => {
      await reset();
      const [claimed] = await taskB.claimReserved(claim("already-claimed"));
      let release!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { ready = resolve; });
      const cancellation = a.transaction(async () => { await cancelCollectionRequest("org", "brand", "request", a); ready(); await gate; });
      await started;
      const submission = taskB.beginSubmission(claimed.id, "already-claimed", new Date().toISOString());
      try { await waitForLock(); } finally { release(); }
      await cancellation;
      assert.equal(await submission, null);
      assert.equal((await taskB.claimReserved(claim("new-worker"))).length, 0);
      assert.equal((await a.query("SELECT id FROM provider_tasks WHERE status='cancelled'")).length, 2);
    });

    await t.test("expired lease transfers ownership and fences the old process before submission", async () => {
      await reset();
      const [original] = await taskA.claimReserved({ ...claim("old"), now: "2026-11-18T00:00:00.000Z" });
      const [reclaimed] = await taskB.claimReserved({ ...claim("new"), now: "2026-11-18T00:01:01.000Z" });
      assert.equal(reclaimed.id, original.id);
      assert.equal(await taskA.beginSubmission(original.id, "old", "2026-11-18T00:01:02.000Z"), null);
      assert.equal((await taskB.beginSubmission(original.id, "new", "2026-11-18T00:01:02.000Z"))?.status, "submitting");
      assert.equal((await taskA.claimReserved({ ...claim("duplicate"), now: "2026-11-18T00:01:03.000Z" })).length, 0);
    });
  } finally {
    await Promise.all(stores.map(store => store.close()));
    // Validated, unique test namespace only; never public or a user schema.
    if (/^dfs_queue_test_[a-f0-9]{32}$/.test(namespace)) await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    await admin.end();
  }
});
