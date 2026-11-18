import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { getRequestLog, listRequestLogs, parseRequestLogOptions, type RequestLogDatabase } from "./requestLog";
import { listRequestItems, parseRequestItemOptions } from "./requestItems";
import { randomUUID } from "node:crypto";
import { getPromptStore } from "@/lib/backend/database";
import { registerLegacyRequest, linkLegacyRun } from "./legacyRequest";
import type { PromptRunSeed } from "@/lib/db/types";
import { retryLegacyRequest, LegacyRetryConflict } from "./legacyRetry";
import { retrySelectedItems, listRetryCandidates } from "./retrySelection";
import { createMixedFailureFixture } from "./mixedFailureFixture";
import { isRetryFailure } from "@/lib/requestRetrySelection";
import { getCollectionActivitySummary } from "./collectionActivity";
import { managePendingSerpItems } from "./pendingSelection";
import { CollectionQueueService } from "./collectionQueue";

test("request filters reject invalid inputs and normalize time zones", () => {
  for (const query of ["page=-1", "size=2000", "sort=DROP", "status=bad", "surface=bad", "attention=bad", "from=no", "from=2026-11-18T00:00:00"]) {
    assert.throws(() => parseRequestLogOptions(new URLSearchParams(query)), Error, query);
  }
  assert.equal(parseRequestLogOptions(new URLSearchParams({ from: "2026-11-18T09:00:00+09:00" })).from, "2026-11-18T00:00:00.000Z");
  assert.throws(() => parseRequestItemOptions(new URLSearchParams("status=invalid")));
  assert.equal(parseRequestItemOptions(new URLSearchParams("status=reserved")).status, "reserved");
  assert.equal(parseRequestLogOptions(new URLSearchParams("attention=1")).attention, true);
  const formQuery = new URLSearchParams("q=&status=&surface=&sort=oldest&size=25");
  assert.equal(parseRequestLogOptions(formQuery).status, null);
  assert.equal(parseRequestLogOptions(formQuery).surface, null);
  assert.equal(parseRequestItemOptions(formQuery).surface, null);
});

test("legacy registration is idempotent and links results to the approved request", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const store = await getPromptStore();
  const rollback = new Error("diagnostic rollback");
  try {
    await assert.rejects(store.transaction(async () => {
      const [sample] = await store.query<{ organization_id: string; brand_id: string; prompt_id: string; text: string }>(
        `SELECT p.organization_id,t.brand_id,p.id AS prompt_id,p.text FROM prompts p JOIN prompt_tracking t ON t.organization_id=p.organization_id AND t.prompt_id=p.id WHERE t.status='active' LIMIT 1`);
      assert.ok(sample, "an active tracked prompt is required for this rollback integration test");
      const clientId = `test-${randomUUID()}`;
      const planned = [{ query: sample.text, promptId: sample.prompt_id, surface: "naver-ai", device: "desktop" }];
      const first = await registerLegacyRequest(sample.organization_id, sample.brand_id, clientId, null, planned);
      const second = await registerLegacyRequest(sample.organization_id, sample.brand_id, clientId, null, planned);
      assert.equal(first.created, 1);
      assert.equal(second.created, 0);
      assert.equal(first.requestId, second.requestId);
      const run: PromptRunSeed = { id: `run-${randomUUID()}`, promptId: sample.prompt_id, llmModelId: "model-naver-ai", marketId: "market-kr", runAt: new Date().toISOString(), status: "success", rawResponse: "test", rawMetadata: { source: "naver-ai-search", query: sample.text } };
      await store.importRun(sample.organization_id, { dir: "test-legacy", filename: `${run.id}.json`, promptRun: run }, null, sample.prompt_id);
      await linkLegacyRun(sample.organization_id, sample.brand_id, clientId, run);
      const page = await listRequestItems(sample.organization_id, sample.brand_id, first.requestId, parseRequestItemOptions(new URLSearchParams()));
      assert.equal(page?.rows[0].result?.runId, run.id);
      assert.equal(page?.rows[0].status, "completed");
      assert.equal((await getRequestLog(sample.organization_id, sample.brand_id, first.requestId))?.counts.total, 1);
      const unfinished = await registerLegacyRequest(sample.organization_id, sample.brand_id, clientId, null, [{ ...planned[0], surface: "google-ai-mode" }]);
      await assert.rejects(retryLegacyRequest(sample.organization_id, sample.brand_id, unfinished.requestId, `blocked-${randomUUID()}`, null), LegacyRetryConflict);
      await store.query("UPDATE legacy_collection_items SET status='cancelled' WHERE collection_request_id=$1 AND run_id IS NULL", [first.requestId]);
      const retried = await retryLegacyRequest(sample.organization_id, sample.brand_id, first.requestId, `retry-${randomUUID()}`, null);
      assert.equal(retried?.count, 1);
      assert.equal(retried?.steps.length, 1);
      assert.equal(retried?.steps[0].kind, "ai");
      assert.equal((await getRequestLog(sample.organization_id, sample.brand_id, retried!.requestId))?.retryOfRequestId, first.requestId);
      assert.equal((await getRequestLog(sample.organization_id, sample.brand_id, first.requestId))?.counts.completed, 1);
      await assert.rejects(retryLegacyRequest(sample.organization_id, sample.brand_id, first.requestId, `duplicate-${randomUUID()}`, null), LegacyRetryConflict);
      assert.equal(await retryLegacyRequest("other-org", sample.brand_id, first.requestId, `foreign-${randomUUID()}`, null), null);
      const selectedRequest = await registerLegacyRequest(sample.organization_id, sample.brand_id, `selected-${randomUUID()}`, null, [{ ...planned[0], surface: "naver-ai" }, { ...planned[0], surface: "google-ai-mode" }]);
      const selectedPage = await listRequestItems(sample.organization_id, sample.brand_id, selectedRequest.requestId, parseRequestItemOptions(new URLSearchParams()));
      const selectedIds = selectedPage!.rows.map(row => row.id);
      const selectedAction = (action: "start" | "retry" | "cancel", itemIds: string[]) => retryLegacyRequest(sample.organization_id, sample.brand_id, selectedRequest.requestId, `action-${randomUUID()}`, null, { action, itemIds });
      await assert.rejects(selectedAction("start", [selectedIds[0]]), LegacyRetryConflict, "fresh session cannot be executed twice");
      await assert.rejects(selectedAction("cancel", ["foreign-item"]), LegacyRetryConflict);
      await store.query("UPDATE legacy_collection_items SET last_seen_at=now()-interval '1 minute' WHERE collection_request_id=$1", [selectedRequest.requestId]);
      assert.equal((await selectedAction("cancel", [selectedIds[0]]))?.count, 1);
      let selectedRows = (await listRequestItems(sample.organization_id, sample.brand_id, selectedRequest.requestId, parseRequestItemOptions(new URLSearchParams())))!.rows;
      assert.equal(selectedRows.find(row => row.id === selectedIds[0])?.status, "cancelled");
      assert.equal(selectedRows.find(row => row.id === selectedIds[1])?.status, "reserved", "unselected item remains untouched");
      await assert.rejects(selectedAction("start", [selectedIds[0]]), LegacyRetryConflict, "cancelled item requires retry action");
      const selectedStart = await selectedAction("start", [selectedIds[1]]);
      assert.equal(selectedStart?.count, 1);
      assert.equal(selectedStart?.steps.length, 1);
      assert.equal((await getRequestLog(sample.organization_id, sample.brand_id, selectedStart!.requestId))?.retryOfRequestId, selectedRequest.requestId);
      selectedRows = (await listRequestItems(sample.organization_id, sample.brand_id, selectedRequest.requestId, parseRequestItemOptions(new URLSearchParams())))!.rows;
      assert.equal(selectedRows.find(row => row.id === selectedIds[1])?.status, "cancelled");
      const fixtureKey = `test-${randomUUID()}`;
      const fixtureId = await createMixedFailureFixture(sample.organization_id, sample.brand_id, fixtureKey);
      assert.equal(await createMixedFailureFixture(sample.organization_id, sample.brand_id, fixtureKey), fixtureId, "fixture is idempotent");
      const mixedPage = (await listRequestItems(sample.organization_id, sample.brand_id, fixtureId, parseRequestItemOptions(new URLSearchParams("size=50"))))!;
      assert.equal(mixedPage.rows.length, 9);
      assert.ok(mixedPage.rows.every(item => ["parse_failed", "provider_failed", "cancelled"].includes(item.status)));
      const failures = mixedPage.rows.filter(isRetryFailure);
      assert.equal(failures.length, 8);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed"))?.length, 8);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "cancelled"))?.length, 1);
      const candidateFilter = (query: string) => parseRequestItemOptions(new URLSearchParams(query));
      const filteredFailures = await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed", undefined, candidateFilter("surface=google-aio&page=99&size=10"));
      assert.equal(filteredFailures?.length, 3, "bulk selection matches all filtered pages, not just the displayed page");
      assert.ok(filteredFailures?.every(item => item.surface === "google-aio"));
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "cancelled", undefined, candidateFilter("surface=google-aio")))?.length, 0);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed", undefined, candidateFilter("status=provider_failed")))?.length, 3);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed", undefined, candidateFilter("status=cancelled")))?.length, 0);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed", undefined, candidateFilter("q=no-such-fixture-prompt")))?.length, 0);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed", undefined, candidateFilter("from=2100-01-01T00%3A00%3A00Z")))?.length, 0);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "cancelled", undefined, candidateFilter("surface=gemini&status=cancelled")))?.length, 1);
      assert.equal(await listRetryCandidates("foreign-org", sample.brand_id, fixtureId, "failed"), null);
      const formItems = await listRequestItems(sample.organization_id, sample.brand_id, fixtureId, parseRequestItemOptions(new URLSearchParams("q=&status=&surface=&sort=oldest&size=25")));
      assert.equal(formItems?.filteredTotal, 9, "detail form's empty filters return all items");
      assert.equal((await listRequestItems(sample.organization_id, sample.brand_id, fixtureId, parseRequestItemOptions(new URLSearchParams("q=&status=parse_failed&surface=gemini&sort=oldest&size=25"))))?.filteredTotal, 0);
      assert.equal((await listRequestItems(sample.organization_id, sample.brand_id, fixtureId, parseRequestItemOptions(new URLSearchParams("q=&status=cancelled&surface=gemini&sort=oldest&size=25"))))?.filteredTotal, 1);
      const unsafe = failures.find(item => item.executionKind === "serp-api")!;
      await store.query("UPDATE provider_tasks SET status='submission_unknown' WHERE id=$1", [unsafe.id]);
      await assert.rejects(retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, `unsafe-${randomUUID()}`, null, [unsafe.id]), LegacyRetryConflict, "unknown submission cannot be paid for again");
      await store.query("UPDATE provider_tasks SET status=$2 WHERE id=$1", [unsafe.id, unsafe.status]);
      assert.equal(await retrySelectedItems("foreign-org", sample.brand_id, fixtureId, `mixed-${randomUUID()}`, null, failures.map(item => item.id)), null);
      await assert.rejects(retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, `mixed-${randomUUID()}`, null, ["foreign-item"]), LegacyRetryConflict);
      const mixedClientId = `mixed-${randomUUID()}`;
      const mixedRetry = await retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, mixedClientId, null, failures.map(item => item.id));
      assert.equal(mixedRetry?.count, 8);
      assert.equal(mixedRetry?.steps.filter(step => step.kind === "serp-api").length, 3);
      assert.equal(mixedRetry?.steps.filter(step => step.kind !== "serp-api").length, 4);
      const retryPage = (await listRequestItems(sample.organization_id, sample.brand_id, mixedRetry!.requestId!, parseRequestItemOptions(new URLSearchParams("size=50"))))!;
      assert.equal(retryPage.rows.length, 8);
      assert.equal(retryPage.rows.filter(item => item.retryOfTaskId).length, 8);
      const originals = (await listRequestItems(sample.organization_id, sample.brand_id, fixtureId, parseRequestItemOptions(new URLSearchParams("size=50"))))!;
      for (const source of originals.rows.filter(isRetryFailure)) {
        assert.equal(source.retries.length, 1, "both local and SERP originals link to their exact retry");
        assert.equal(source.retries[0].requestId, mixedRetry!.requestId);
        assert.equal(source.status, failures.find(item => item.id === source.id)!.status, "original failure remains unchanged");
      }
      assert.equal(originals.rows.find(item => item.surface === "gemini")!.retries.length, 0, "unselected item has no retry link");
      const childRequests = await listRequestLogs(sample.organization_id, sample.brand_id, parseRequestLogOptions(new URLSearchParams()), undefined, undefined, fixtureId);
      assert.ok(childRequests.rows.some(child => child.id === mixedRetry!.requestId));
      assert.equal((await listRequestLogs("foreign-org", sample.brand_id, parseRequestLogOptions(new URLSearchParams()), undefined, undefined, fixtureId)).rows.length, 0);
      assert.ok(retryPage.rows.some(item => item.surface === "google-aio" && item.device === "mobile"), "exact original device retained");
      assert.equal((await getRequestLog(sample.organization_id, sample.brand_id, mixedRetry!.requestId!))?.counts.total, 8);
      await assert.rejects(retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, mixedClientId, null, failures.map(item => item.id)), LegacyRetryConflict);
      await assert.rejects(retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, `overlap-${randomUUID()}`, null, failures.map(item => item.id)), LegacyRetryConflict);
      await store.query("UPDATE provider_tasks SET status='completed' WHERE collection_request_id=$1", [mixedRetry!.requestId]);
      await store.query("UPDATE legacy_collection_items SET status='parse_failed' WHERE collection_request_id=$1", [mixedRetry!.requestId]);
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "failed"))?.length, 0, "originals remain excluded even after retry completes or fails");
      assert.equal((await listRetryCandidates(sample.organization_id, sample.brand_id, fixtureId, "cancelled"))?.length, 1, "unselected cancelled item remains eligible");
      await assert.rejects(retrySelectedItems(sample.organization_id, sample.brand_id, fixtureId, `again-${randomUUID()}`, null, failures.map(item => item.id)), LegacyRetryConflict);
      const localOriginal = failures.find(item => item.executionKind === "legacy")!;
      await assert.rejects(retryLegacyRequest(sample.organization_id, sample.brand_id, fixtureId, `legacy-bypass-${randomUUID()}`, null, { action: "retry", itemIds: [localOriginal.id] }), LegacyRetryConflict);
      const nextFailures = await listRetryCandidates(sample.organization_id, sample.brand_id, mixedRetry!.requestId!, "failed");
      assert.equal(nextFailures?.length, 4, "failed items in the latest request remain eligible");
      const pending = await new CollectionQueueService().enqueueApproved({ organizationId: sample.organization_id, brandId: sample.brand_id,
        clientRequestId: `pending-${randomUUID()}`, requestKind: "manual", tasks: ["desktop", "mobile"].map(device => ({ query: sample.text, promptId: sample.prompt_id,
          surface: "google-aio" as const, device: device as "desktop" | "mobile", marketId: "market-kr", scheduledWindow: `pending:${randomUUID()}` })) });
      const pendingIds = pending.tasks.map(task => task.id);
      const pendingAction = (action: "wake" | "cancel", ids = pendingIds) => managePendingSerpItems(sample.organization_id, sample.brand_id, pending.request.id, ids, action);
      assert.equal((await pendingAction("wake"))?.count, 2);
      let pendingPage = (await listRequestItems(sample.organization_id, sample.brand_id, pending.request.id, parseRequestItemOptions(new URLSearchParams())))!;
      assert.ok(pendingPage.rows.every(item => item.status === "reserved" && item.canManagePending), "wake does not create or submit provider tasks");
      assert.equal(await managePendingSerpItems("other-org", sample.brand_id, pending.request.id, pendingIds, "cancel"), null);
      await assert.rejects(pendingAction("cancel", [pendingIds[0], localOriginal.id]), LegacyRetryConflict);
      await store.query("UPDATE provider_tasks SET lease_owner='worker',lease_expires_at=$2 WHERE id=$1", [pendingIds[1], new Date(Date.now() + 60_000).toISOString()]);
      await assert.rejects(pendingAction("cancel"), LegacyRetryConflict, "worker-claimed task cannot be cancelled");
      pendingPage = (await listRequestItems(sample.organization_id, sample.brand_id, pending.request.id, parseRequestItemOptions(new URLSearchParams())))!;
      assert.equal(pendingPage.rows.find(item => item.id === pendingIds[1])?.canManagePending, false);
      assert.ok(pendingPage.rows.every(item => item.status === "reserved"), "partial batch cancellation rolls back");
      await store.query("UPDATE provider_tasks SET lease_owner=NULL,lease_expires_at=NULL,submission_attempted_at=$2 WHERE id=$1", [pendingIds[1], new Date().toISOString()]);
      await assert.rejects(pendingAction("cancel"), LegacyRetryConflict, "uncertain prior submission cannot be cancelled");
      await store.query("UPDATE provider_tasks SET submission_attempted_at=NULL,provider_task_id='existing',status='queued' WHERE id=$1", [pendingIds[1]]);
      await assert.rejects(pendingAction("cancel"), LegacyRetryConflict);
      await store.query("UPDATE provider_tasks SET provider_task_id=NULL,status='reserved' WHERE id=$1", [pendingIds[1]]);
      assert.equal((await pendingAction("cancel", [pendingIds[0]]))?.count, 1);
      const pendingSummary = (await getRequestLog(sample.organization_id, sample.brand_id, pending.request.id))!;
      assert.equal(pendingSummary.counts.total, 2); assert.equal(pendingSummary.counts.cancelled, 1); assert.equal(pendingSummary.counts.waiting, 1);
      await assert.rejects(pendingAction("wake", [pendingIds[0]]), LegacyRetryConflict);
      await store.query("UPDATE collection_requests SET cancel_requested=true WHERE id=$1", [pending.request.id]);
      await assert.rejects(pendingAction("wake", [pendingIds[1]]), LegacyRetryConflict);
      assert.equal((await pendingAction("cancel", [pendingIds[1]]))?.count, 1);
      throw rollback;
    }), error => error === rollback);
  } finally { await store.close(); }
});

test("Postgres request list scopes, aggregates before filtering and clamps pages", { skip: !process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING }, async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL });
  const client = await pool.connect();
  const db: RequestLogDatabase = { query: async <T>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows as T[] };
  try {
    await client.query("BEGIN");
    // Session-local tables shadow real tables. No production rows are changed.
    await client.query(`CREATE TEMP TABLE collection_requests AS SELECT * FROM public.collection_requests WITH NO DATA;
      CREATE TEMP TABLE provider_tasks AS SELECT * FROM public.provider_tasks WITH NO DATA;
      CREATE TEMP TABLE neodio_users AS SELECT * FROM public.neodio_users WITH NO DATA;
      CREATE TEMP TABLE prompt_runs AS SELECT * FROM public.prompt_runs WITH NO DATA;`);
    await client.query(`CREATE TEMP TABLE legacy_items_test AS SELECT * FROM provider_tasks WITH NO DATA;
      ALTER TABLE legacy_items_test ADD COLUMN run_id text;
      CREATE TEMP VIEW collection_execution_items AS
        SELECT id,organization_id,brand_id,collection_request_id,prompt_id,query_snapshot,surface,device,status,created_at,submitted_at,completed_at,
          submission_attempted_at,estimated_cost_usd,actual_cost_usd,error_code,error_message,retry_of_task_id,'serp-api'::text AS execution_kind,NULL::text AS run_id FROM provider_tasks
        UNION ALL
        SELECT id,organization_id,brand_id,collection_request_id,prompt_id,query_snapshot,surface,device,status,created_at,submitted_at,completed_at,
          submission_attempted_at,estimated_cost_usd,actual_cost_usd,error_code,error_message,retry_of_task_id,'legacy'::text,run_id FROM legacy_items_test;`);
    await client.query(`INSERT INTO collection_requests(id,organization_id,brand_id,request_kind,status,created_at,approved_at,estimated_cost_usd,cancel_requested)
      VALUES ('a','org','brand','manual','queued','2026-11-18T01:00:00.000Z','2026-11-18T01:00:00.000Z',0.3,false),
      ('b','org','brand','manual','queued','2026-11-18T02:00:00.000Z','2026-11-18T02:00:00.000Z',0.1,false),
      ('hidden','other','brand','manual','queued','2026-11-18T03:00:00.000Z','2026-11-18T03:00:00.000Z',0,false),
      ('other-brand','org','other','manual','queued','2026-11-18T03:00:00.000Z','2026-11-18T03:00:00.000Z',0,false);
      INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,surface,device,status,actual_cost_usd,query_snapshot,completed_at)
      VALUES ('t1','org','brand','a','google-aio','desktop','completed',0.1,'match','2026-11-18T04:00:00.000Z'),
      ('t2','org','brand','a','naver-aio','mobile','completed',0.2,'other','2026-11-18T05:00:00.000Z'),
      ('t3','org','brand','b','google-aio','desktop','submission_unknown',0,'unknown',null);`);
    const list = (query = "") => listRequestLogs("org", "brand", parseRequestLogOptions(new URLSearchParams(query)), db);
    const page = await list("surface=google-aio&status=completed&q=match&page=99");
    assert.equal(page.filteredTotal, 1);
    assert.equal(page.page, 1);
    assert.equal(page.rows[0].counts.total, 2);
    assert.equal(page.rows[0].actualCostUsd, 0.3);
    assert.equal(page.rows[0].completedAt, "2026-11-18T05:00:00.000Z");
    assert.deepEqual((await list()).rows.map(row => row.id), ["b", "a"]);
    assert.deepEqual((await list("q=&status=&surface=&sort=newest&size=25")).rows.map(row => row.id), ["b", "a"], "list form empty filters match no filters");
    assert.equal((await list("status=needs_attention")).rows[0].id, "b");
    assert.equal((await list("q=%27%20OR%201%3D1--")).filteredTotal, 0);
    assert.equal((await list("to=2026-11-18T02%3A00%3A00Z")).filteredTotal, 1);
    assert.equal((await list("q=absent")).pageCount, 1);
    assert.equal((await getRequestLog("org", "brand", "a", db))?.counts.total, 2);
    assert.equal(await getRequestLog("org", "other", "a", db), null);
    await client.query(`INSERT INTO prompt_runs(id,organization_id,provider_task_id,run_at,raw_response,source_dir,source_filename,observation_outcome,original_json)
      VALUES ('run1','org','t1','2026-11-18T04:00:00.000Z','answer','dataforseo','t1.json','ai_answered','{"rawMetadata":{"citations":[{"url":"https://example.com"}]}}'),
      ('run2','org','t1','2026-11-18T05:00:00.000Z','latest','dataforseo','latest.json','ai_absent','{}'),
      ('foreign-run','other','t2','2026-11-18T05:00:00.000Z','private','dataforseo','private.json','ai_answered','{}');`);
    const items = (requestId: string, query = "") => listRequestItems("org", "brand", requestId, parseRequestItemOptions(new URLSearchParams(query)), db);
    const detail = await items("a");
    assert.equal(detail?.rows.length, 2, "multiple results never duplicate a task");
    assert.equal(detail?.rows.find(row => row.id === "t1")?.result?.filename, "latest.json");
    assert.equal(detail?.rows.find(row => row.id === "t2")?.result, null, "cross-organization results are excluded");
    assert.equal((await items("b"))?.rows[0].result, null, "unfinished tasks remain visible without a result");
    assert.equal((await items("b"))?.rows[0].status, "submission_unknown");
    assert.equal((await items("a", "q=absent"))?.filteredTotal, 0);
    assert.equal((await items("a", "surface=naver-aio&page=99"))?.page, 1);
    const multi = await items("a", "status=completed,cancelled&surface=google-aio&surface=naver-aio");
    assert.equal(multi?.filteredTotal, 2);
    assert.deepEqual(multi?.facets, { status: { completed: 2 }, surface: { "google-aio": 1, "naver-aio": 1 }, retry: { failed: 0, cancelled: 0 } });
    const emptyStatus = await items("a", "status=cancelled&surface=google-aio");
    assert.equal(emptyStatus?.filteredTotal, 0);
    assert.deepEqual(emptyStatus?.facets?.status, { completed: 1 }, "status facet ignores its own filter");
    assert.deepEqual(emptyStatus?.facets?.surface, {}, "platform facet applies selected status");
    assert.equal(await items("hidden"), null);
    assert.equal(await items("other-brand"), null);
    await client.query(`INSERT INTO legacy_items_test(id,organization_id,brand_id,collection_request_id,surface,device,status,actual_cost_usd,query_snapshot,run_id)
      VALUES ('legacy-1','org','brand','a','naver-ai','desktop','completed',0,'legacy query','run-legacy');
      INSERT INTO prompt_runs(id,organization_id,run_at,raw_response,source_dir,source_filename,original_json)
      VALUES ('run-legacy','org','2026-11-18T06:00:00.000Z','legacy answer','.tmp/naver-ai','legacy.json','{}');`);
    assert.equal((await getRequestLog("org", "brand", "a", db))?.counts.total, 3);
    const mixed = await items("a");
    assert.equal(mixed?.rows.length, 3);
    assert.equal(mixed?.rows.find(row => row.id === "legacy-1")?.executionKind, "legacy");
    assert.equal(mixed?.rows.find(row => row.id === "legacy-1")?.result?.filename, "legacy.json");
    await client.query("UPDATE provider_tasks SET provider='dataforseo'");
    assert.deepEqual((await list("attention=1")).rows.map(row => row.id), ["b"], "unknown submissions match attention shortcut");
    await client.query(`INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,provider,surface,device,status,query_snapshot)
      VALUES ('failed-attention','org','brand','a','dataforseo','google-aio','desktop','provider_failed','failed')`);
    assert.deepEqual((await list("attention=1")).rows.map(row => row.id), ["b", "a"], "failed requests also match, not just needs_attention status");
    await client.query(`INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,provider,surface,device,status,query_snapshot,retry_of_task_id)
      VALUES ('retry-attention','org','brand','b','dataforseo','google-aio','desktop','reserved','retry','failed-attention')`);
    await client.query("UPDATE legacy_items_test SET status='parse_failed' WHERE id='legacy-1'");
    assert.deepEqual((await list("attention=1")).rows.map(row => row.id), ["b", "a"], "local failures match the same attention filter");
    assert.equal((await getCollectionActivitySummary("org", "brand", db)).attentionCount, 2, "local failure and unknown SERP counted, retried original excluded");
    await client.query(`INSERT INTO legacy_items_test(id,organization_id,brand_id,collection_request_id,surface,device,status,query_snapshot)
      VALUES ('gemini-failed','org','brand','a','gemini','desktop','parse_failed','gemini'),
        ('gemini-cancelled','org','brand','a','gemini','desktop','cancelled','cancelled')`);
    assert.equal((await getCollectionActivitySummary("org", "brand", db)).attentionCount, 3, "Gemini failures included, cancellations excluded");
    const geminiFilter = "status=parse_failed,cancelled&surface=gemini";
    assert.deepEqual((await items("a", geminiFilter))?.facets?.retry, { failed: 1, cancelled: 1 });
    assert.equal((await listRetryCandidates("org", "brand", "a", "failed", db, parseRequestItemOptions(new URLSearchParams(geminiFilter))))?.length, 1);
    await client.query(`INSERT INTO legacy_items_test(id,organization_id,brand_id,collection_request_id,surface,device,status,query_snapshot,retry_of_task_id)
      VALUES ('local-retry','org','brand','b','naver-ai','desktop','reserved','retry','legacy-1'),
        ('gemini-retry','org','brand','b','gemini','desktop','reserved','retry gemini','gemini-failed')`);
    assert.equal((await getCollectionActivitySummary("org", "brand", db)).attentionCount, 1, "local and Gemini retried originals excluded");
    assert.deepEqual((await items("a", geminiFilter))?.facets?.retry, { failed: 0, cancelled: 1 }, "selection counts exclude retried originals");
    assert.deepEqual((await list("attention=1")).rows.map(row => row.id), ["b"]);
    await client.query("UPDATE legacy_items_test SET status='parse_failed' WHERE id='gemini-retry'");
    assert.equal((await getCollectionActivitySummary("org", "brand", db)).attentionCount, 2, "failed retry is counted instead of its original");
    assert.equal((await getCollectionActivitySummary("foreign-org", "brand", db)).attentionCount, 0);
    assert.equal((await list("attention=1&page=99")).page, 1);
    await client.query("UPDATE provider_tasks SET status='submitting' WHERE id='t1'");
    await client.query("UPDATE provider_tasks SET status='raw_saved' WHERE id='t2'");
    const phases = (await getRequestLog("org", "brand", "a", db))!.phases;
    assert.deepEqual(phases, { submitting: 1, collecting: 0, processing: 1 }, "progress phases come only from scoped DB states");
    await client.query(`INSERT INTO provider_tasks(id,organization_id,brand_id,collection_request_id,provider,surface,device,status,query_snapshot,retry_of_task_id)
      VALUES ('foreign-retry','other','other-brand','hidden','dataforseo','google-aio','desktop','reserved','hidden','t1')`);
    assert.equal((await items("a"))?.rows.find(item => item.id === "t1")?.retries.length, 0, "item links never expose another tenant's retry request");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
