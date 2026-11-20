import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { setTimeout as delay } from "node:timers/promises";
import { getPromptStore } from "../database";
import { PromptStore } from "../database/store";
import { registerLegacyRequest } from "../dataforseo/legacyRequest";
import { reportLegacySession } from "../dataforseo/legacySession";
import { cancelCollectionRequest } from "../dataforseo/cancelRequest";
import { listRequestItems, parseRequestItemOptions } from "../dataforseo/requestItems";
import { claimGemini, enqueueGemini, runGeminiBatch } from "./geminiQueue";
import { isGeminiQueueScope } from "./geminiQueueWake";
import { selectionAvailableActions, isRetrySelectable } from "@/lib/requestRetrySelection";

test.after(async () => { if (process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING) await (await getPromptStore()).close(); });

test("Gemini queue messages validate explicit tenant/request identities", () => {
  assert.equal(isGeminiQueueScope({ organizationId: "o", brandId: "b", clientRequestId: "r" }), true);
  assert.equal(isGeminiQueueScope({ organizationId: "o", brandId: "b" }), false);
  assert.equal(isGeminiQueueScope(null), false);
});

test("independent PostgreSQL workers share three slots, rate budget and uncertain-call fencing", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  const namespace = `gemini_queue_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(namespace, /^gemini_queue_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString, max: 1 });
  const stores: PromptStore[] = [];
  try {
    await admin.query(`CREATE SCHEMA ${namespace}`);
    await admin.query(`CREATE TABLE ${namespace}.collection_requests(id text,organization_id text,brand_id text,client_request_id text,cancel_requested boolean DEFAULT false);
      CREATE TABLE ${namespace}.legacy_collection_items(id text,organization_id text,brand_id text,collection_request_id text,query_snapshot text,prompt_id text,status text,created_at text,submitted_at text,last_seen_at text,completed_at text,error_message text,run_id text);
      CREATE TABLE ${namespace}.prompt_runs(id text,organization_id text,status text,original_json jsonb);
      CREATE TABLE ${namespace}.gemini_collection_queue(item_id text,started_at text,finished_at text)`);
    for (let i = 0; i < 2; i++) stores.push(new PromptStore(new Pool({ connectionString, max: 1, options: `-c search_path=${namespace},pg_catalog -c statement_timeout=5000` })));
    const [a,b] = stores;
    await a.query(`INSERT INTO collection_requests(id,organization_id,brand_id,client_request_id) VALUES ('r','o','b','client');
      INSERT INTO legacy_collection_items(id,organization_id,brand_id,collection_request_id,query_snapshot,status,created_at)
      SELECT 'job-'||n,'o','b','r','q-'||n,'reserved','2026-11-20T00:00:00.000Z' FROM generate_series(1,35) n;
      INSERT INTO gemini_collection_queue(item_id) SELECT id FROM legacy_collection_items`);
    const scope = { organizationId: "o", brandId: "b", clientRequestId: "client" };
    const now = new Date("2026-11-20T01:00:00.000Z");
    const claims = await Promise.all([claimGemini(scope,a,now),claimGemini(scope,b,now)]);
    assert.equal(claims.flat().length,3);
    assert.equal(new Set(claims.flat().map(j => j.id)).size,3);
    assert.equal((await claimGemini({ ...scope, brandId: "foreign" },a,now)).length,0);
    await a.query("UPDATE legacy_collection_items SET status='completed' WHERE id=ANY($1::text[])",[claims.flat().map(j=>j.id)]);
    await a.query("UPDATE gemini_collection_queue SET started_at=$1 WHERE item_id IN (SELECT id FROM legacy_collection_items ORDER BY id LIMIT 30)",[now.toISOString()]);
    assert.equal((await claimGemini(scope,b,now)).length,0,"minute budget applies to completed jobs too");
    const later = new Date(now.getTime()+61_000);
    const next = await claimGemini(scope,a,later);
    assert.equal(next.length,3);
    await a.query("INSERT INTO prompt_runs(id,organization_id,status,original_json) VALUES ($1,'o','success','{}')", [`run-gemini-${next[0].id}`]);
    const afterTimeout = new Date(later.getTime()+181_000);
    const final = await claimGemini(scope,b,afterTimeout);
    assert.equal(final.length,2);
    const failed = await a.query<{status:string}>("SELECT status FROM legacy_collection_items WHERE id=ANY($1::text[])",[next.map(j=>j.id)]);
    assert.equal(failed.filter(j=>j.status==='completed').length,1,"saved result is recovered without another provider call");
    assert.equal(failed.filter(j=>j.status==='provider_failed').length,2);
    assert.ok(final.every(j=>!next.some(old=>old.id===j.id)),"uncertain submissions are never reclaimed");
  } finally {
    await Promise.all(stores.map(s=>s.close()));
    if (/^gemini_queue_test_[a-f0-9]{32}$/.test(namespace)) await admin.query(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`);
    await admin.end();
  }
});

test("persisted Gemini jobs cap concurrency, survive browser leave, isolate requests and preserve sent results on cancel", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const db = await getPromptStore();
  const rollback = new Error("rollback Gemini queue fixture");
  await assert.rejects(db.transaction(async () => {
    const [sample] = await db.query<{ organization_id: string; brand_id: string; prompt_id: string; text: string }>(`SELECT p.organization_id,t.brand_id,p.id AS prompt_id,p.text
      FROM prompts p JOIN prompt_tracking t ON t.prompt_id=p.id AND t.organization_id=p.organization_id WHERE t.status='active' LIMIT 1`);
    assert.ok(sample);
    const scope = { organizationId: sample.organization_id, brandId: sample.brand_id, clientRequestId: `gemini-test-${randomUUID()}` };
    const keywords = Array.from({ length: 8 }, (_, i) => `Gemini queue fixture ${i} ${scope.clientRequestId}`);
    const registered = await registerLegacyRequest(scope.organizationId, scope.brandId, scope.clientRequestId, null,
      keywords.map(query => ({ query, promptId: sample.prompt_id, surface: "gemini", device: "desktop" })));
    assert.equal((await enqueueGemini(scope, keywords, db)).count, 8);
    await enqueueGemini(scope, keywords, db);
    assert.equal((await db.query("SELECT q.item_id FROM gemini_collection_queue q JOIN legacy_collection_items i ON i.id=q.item_id WHERE i.collection_request_id=$1", [registered.requestId])).length, 8);
    await assert.rejects(enqueueGemini({ ...scope, brandId: "other-brand" }, keywords, db));
    await assert.rejects(enqueueGemini(scope, ["not approved"], db));
    const jobs = await claimGemini(scope, db);
    assert.equal(jobs.length, 3);
    assert.equal((await claimGemini(scope, db)).length, 0);
    const otherScope = { ...scope, clientRequestId: `${scope.clientRequestId}-other` };
    await registerLegacyRequest(scope.organizationId, scope.brandId, otherScope.clientRequestId, null, [{ query: "another request", surface: "gemini", device: "desktop" }]);
    await enqueueGemini(otherScope, ["another request"], db);
    assert.equal((await claimGemini(otherScope, db)).length, 0, "shared capacity across requests");
    await reportLegacySession(scope.organizationId, scope.brandId, scope.clientRequestId, "leave");
    const page = await listRequestItems(scope.organizationId, scope.brandId, registered.requestId, parseRequestItemOptions(new URLSearchParams()));
    assert.equal(page?.rows.filter(i => i.status === "collecting").length, 3);
    assert.equal(page?.rows.every(i => i.serverManaged), true);
    assert.equal(isRetrySelectable(page!.rows.find(i => i.status === "collecting")!), false);
    assert.equal(selectionAvailableActions([page!.rows.find(i => i.status === "reserved")!]).canCollect, true, "pending action wakes existing work rather than creating a retry");
    await db.query("UPDATE legacy_collection_items SET status='completed',completed_at=now() WHERE id=ANY($1::text[])", [jobs.map(j => j.id)]);
    let active = 0, peak = 0;
    const batch = await runGeminiBatch(scope, db, async job => {
      active++; peak = Math.max(peak, active);
      await delay(10);
      const id = `run-gemini-fixture-${randomUUID()}`;
      await db.importRun(scope.organizationId, { dir: "test-gemini-queue", filename: `${id}.json`, promptRun: { id, promptId: sample.prompt_id, llmModelId: "model-gemini-25", marketId: "market-kr", runAt: new Date().toISOString(), status: "success", rawResponse: "fixture answer", rawMetadata: { source: "api", query: job.query, webSearch: true, citations: [] } } }, null, sample.prompt_id);
      active--;
      return id;
    });
    assert.equal(peak, 3);
    assert.equal(batch.processed, 3);
    assert.equal(batch.pending, true);
    const remaining = await claimGemini(scope, db);
    assert.equal(remaining.length, 2);
    await cancelCollectionRequest(scope.organizationId, scope.brandId, registered.requestId, db);
    const afterCancel = await db.query<{ status: string }>("SELECT status FROM legacy_collection_items WHERE id=ANY($1::text[])", [remaining.map(i => i.id)]);
    assert.ok(afterCancel.every(i => i.status === "collecting"), "already sent calls keep their results");
    assert.equal((await claimGemini(scope, db)).length, 0);
    const completed = await listRequestItems(scope.organizationId, scope.brandId, registered.requestId, parseRequestItemOptions(new URLSearchParams()));
    assert.equal(completed?.rows.filter(i => i.result?.answerLength === 14).length, 3);
    await assert.rejects(enqueueGemini(scope, keywords, db), /취소/);
    const failedBatch = await runGeminiBatch(otherScope, db, async () => { throw new Error("mock provider failure"); });
    assert.equal(failedBatch.processed,1);
    assert.equal(failedBatch.pending,false);
    const [failedItem] = await db.query<{ status:string }>("SELECT i.status FROM legacy_collection_items i JOIN collection_requests r ON r.id=i.collection_request_id WHERE r.client_request_id=$1 AND r.organization_id=$2", [otherScope.clientRequestId, scope.organizationId]);
    assert.equal(failedItem.status,"provider_failed");
    throw rollback;
  }), error => error === rollback);
});
