import { getPromptStore } from "../database";
import type { PromptStore } from "../database/store";
import { getLlmProvider } from "./registry";
import { resolveApiKey, runLlmQuery } from "./runner";

export interface GeminiQueueScope { organizationId: string; brandId: string; clientRequestId: string }
type Job = { id: string; organizationId: string; brandId: string; query: string; promptId: string | null };
type Database = Pick<PromptStore, "query" | "transaction">;

/** Only explicitly registered, owned request items may enter the server queue. */
export async function enqueueGemini(scope: GeminiQueueScope, keywords: string[], db: Database) {
  return db.transaction(async () => {
    const [request] = await db.query<{ id: string; cancel_requested: boolean }>(`SELECT id,cancel_requested FROM collection_requests
      WHERE organization_id=$1 AND brand_id=$2 AND client_request_id=$3 FOR UPDATE`, [scope.organizationId, scope.brandId, scope.clientRequestId]);
    if (!request || request.cancel_requested) throw new Error("수집 요청을 찾을 수 없거나 취소된 요청입니다.");
    const items = await db.query<{ id: string; query: string }>(`SELECT id,query_snapshot AS query FROM legacy_collection_items
      WHERE organization_id=$1 AND brand_id=$2 AND collection_request_id=$3 AND surface='gemini' AND device='desktop' AND query_snapshot=ANY($4::text[])`,
    [scope.organizationId, scope.brandId, request.id, keywords]);
    if (new Set(items.map(i => i.query)).size !== new Set(keywords).size) throw new Error("요청에 등록된 Gemini 프롬프트만 시작할 수 있습니다.");
    await db.query("INSERT INTO gemini_collection_queue(item_id) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING", [items.map(i => i.id)]);
    return { requestId: request.id, count: items.length };
  });
}

/** A project-wide lock enforces three in-flight calls across requests and workers. */
export async function claimGemini(scope: GeminiQueueScope, db: Database, now = new Date()) {
  return db.transaction(async () => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('gemini-collection-capacity'))");
    const time = now.toISOString();
    await db.query(`UPDATE legacy_collection_items i SET run_id=p.id,status=CASE WHEN p.status='success' THEN 'completed' ELSE 'provider_failed' END,
      completed_at=$1,error_message=p.original_json->'rawMetadata'->>'errorMessage'
      FROM gemini_collection_queue q,prompt_runs p WHERE q.item_id=i.id AND q.started_at IS NOT NULL AND i.run_id IS NULL
        AND i.status IN ('collecting','provider_failed') AND p.id='run-gemini-'||i.id AND p.organization_id=i.organization_id`, [time]);
    // Uncertain interrupted calls are never automatically submitted again.
    await db.query(`UPDATE legacy_collection_items i SET status='provider_failed',completed_at=$1,
      error_message='서버 처리 시간이 초과되었습니다. 중복 호출을 피하기 위해 자동 재실행하지 않았습니다. 요청 로그에서 확인해 주세요.'
      FROM gemini_collection_queue q WHERE q.item_id=i.id AND i.status='collecting' AND q.started_at<$2`,
    [time, new Date(now.getTime() - 180_000).toISOString()]);
    const [{ active, recent }] = await db.query<{ active: number; recent: number }>(`SELECT
      count(*) FILTER (WHERE i.status='collecting')::int AS active,
      count(*) FILTER (WHERE q.started_at >= $1)::int AS recent
      FROM gemini_collection_queue q JOIN legacy_collection_items i ON i.id=q.item_id`, [new Date(now.getTime() - 60_000).toISOString()]);
    const limit = Math.max(0, Math.min(3 - active, 30 - recent));
    if (!limit) return [];
    const jobs = await db.query<Job>(`SELECT i.id,i.organization_id AS "organizationId",i.brand_id AS "brandId",i.query_snapshot AS query,i.prompt_id AS "promptId"
      FROM gemini_collection_queue q JOIN legacy_collection_items i ON i.id=q.item_id JOIN collection_requests r ON r.id=i.collection_request_id
      WHERE i.organization_id=$1 AND i.brand_id=$2 AND r.organization_id=$1 AND r.brand_id=$2 AND r.client_request_id=$3
        AND NOT r.cancel_requested AND i.status='reserved' AND q.started_at IS NULL
      ORDER BY i.created_at,i.id LIMIT $4 FOR UPDATE OF i,r SKIP LOCKED`, [scope.organizationId, scope.brandId, scope.clientRequestId, limit]);
    if (jobs.length) {
      const ids = jobs.map(j => j.id);
      await db.query("UPDATE gemini_collection_queue SET started_at=$2 WHERE item_id=ANY($1::text[])", [ids, time]);
      await db.query("UPDATE legacy_collection_items SET status='collecting',submitted_at=$2,last_seen_at=$2 WHERE id=ANY($1::text[])", [ids, time]);
    }
    return jobs;
  });
}

export async function hasPendingGemini(scope: GeminiQueueScope, db: Database) {
  const [{ pending }] = await db.query<{ pending: boolean }>(`SELECT EXISTS(SELECT 1 FROM gemini_collection_queue q
    JOIN legacy_collection_items i ON i.id=q.item_id JOIN collection_requests r ON r.id=i.collection_request_id
    WHERE i.organization_id=$1 AND i.brand_id=$2 AND r.organization_id=$1 AND r.brand_id=$2 AND r.client_request_id=$3
      AND NOT r.cancel_requested AND i.status IN ('reserved','collecting')) AS pending`, [scope.organizationId, scope.brandId, scope.clientRequestId]);
  return pending;
}

export async function runGeminiBatch(scope: GeminiQueueScope, database?: PromptStore, execute?: (job: Job) => Promise<string>) {
  const db = database ?? await getPromptStore();
  const provider = getLlmProvider("gemini");
  const apiKey = execute ? "" : resolveApiKey(provider.apiKeyEnv);
  const jobs = await claimGemini(scope, db);
  await Promise.all(jobs.map(async job => {
    try {
      const runId = execute ? await execute(job) : (await runLlmQuery({ store: db, orgId: job.organizationId, provider, query: job.query,
        apiKey, runId: `run-gemini-${job.id}`, promptId: job.promptId ?? undefined,
        webSearch: true, fallbackWithoutSearch: true, retries: 1, locale: "ko-KR", signal: AbortSignal.timeout(120_000) })).runId;
      const [run] = await db.query<{ status: string; error: string | null }>("SELECT status,original_json->'rawMetadata'->>'errorMessage' AS error FROM prompt_runs WHERE id=$1 AND organization_id=$2", [runId, job.organizationId]);
      if (!run) throw new Error("저장된 수집 결과를 찾을 수 없습니다.");
      await db.query(`UPDATE legacy_collection_items SET run_id=$2,status=$3,completed_at=$4,error_message=$5
        WHERE id=$1 AND organization_id=$6 AND brand_id=$7`, [job.id, runId, run.status === "success" ? "completed" : "provider_failed", new Date().toISOString(), run.error, job.organizationId, job.brandId]);
    } catch {
      await db.query(`UPDATE legacy_collection_items SET status='provider_failed',completed_at=$2,error_message='Gemini 처리에 실패했습니다. 요청 로그에서 다시 시도해 주세요.'
        WHERE id=$1 AND organization_id=$3 AND brand_id=$4 AND run_id IS NULL`, [job.id, new Date().toISOString(), job.organizationId, job.brandId]);
    } finally {
      await db.query("UPDATE gemini_collection_queue SET finished_at=$2 WHERE item_id=$1", [job.id, new Date().toISOString()]);
    }
  }));
  return { processed: jobs.length, pending: await hasPendingGemini(scope, db) };
}
