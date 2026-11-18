import { getPromptStore } from "@/lib/backend/database";
import { parseRequestLogOptions, RequestLogInputError, type RequestLogDatabase } from "./requestLog";
import type { ProviderTaskStatus } from "./types";

export function parseRequestItemOptions(params: URLSearchParams) {
  const status = params.get("status");
  if (status && status !== "all" && !["reserved", "submitting", "submission_unknown", "queued", "collecting", "raw_saved", "normalized", "completed", "provider_failed", "artifact_failed", "projection_failed", "parse_failed", "cancelled"].includes(status)) {
    throw new RequestLogInputError("status 값이 올바르지 않습니다.");
  }
  const shared = new URLSearchParams(params);
  shared.delete("status");
  if (!shared.has("sort")) shared.set("sort", "oldest");
  return { ...parseRequestLogOptions(shared), status: status && status !== "all" ? status : null };
}

export interface RequestItemRow {
  id: string;
  executionKind: "serp-api" | "legacy";
  promptId: string | null;
  query: string;
  surface: string;
  device: string;
  status: ProviderTaskStatus;
  createdAt: string;
  submissionAttemptedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  estimatedCostUsd: number;
  actualCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryOfTaskId: string | null;
  retries: { requestId: string; taskId: string; status: ProviderTaskStatus }[];
  result: null | { runId: string; dir: string; filename: string; outcome: string | null; answerLength: number; citationCount: number; category: string | null; topic: string | null };
}

export interface RequestItemPage { rows: RequestItemRow[]; filteredTotal: number; page: number; pageSize: number; pageCount: number }

/** Returns null for an out-of-scope request, and an empty page for an empty filter. */
export async function listRequestItems(organizationId: string, brandId: string, requestId: string, options: ReturnType<typeof parseRequestItemOptions>, database?: RequestLogDatabase): Promise<RequestItemPage | null> {
  const db = database ?? await getPromptStore();
  const direction = options.sort === "newest" ? "DESC" : "ASC";
  const [result] = await db.query<{ payload: RequestItemPage | null }>(`
    WITH request AS (
      SELECT id FROM collection_requests WHERE organization_id=$1 AND brand_id=$2 AND id=$3
    ), filtered AS (
      SELECT t.* FROM collection_execution_items t JOIN request r ON r.id=t.collection_request_id
      WHERE t.organization_id=$1 AND t.brand_id=$2
        AND ($4::text IS NULL OR t.status=$4) AND ($5::text IS NULL OR t.surface=$5)
        AND ($6='' OR strpos(lower(t.query_snapshot),lower($6))>0)
        AND ($9::text IS NULL OR t.created_at >= $9) AND ($10::text IS NULL OR t.created_at < $10)
    ), pagination AS (
      SELECT count(*)::int AS total, GREATEST(1,ceil(count(*)::numeric/$7)::int) AS pages FROM filtered
    ), bounds AS (
      SELECT *,LEAST($8::int,pages) AS current_page FROM pagination
    ), paged AS (
      SELECT * FROM filtered ORDER BY created_at ${direction},id ${direction}
      LIMIT $7 OFFSET (SELECT (current_page-1)*$7 FROM bounds)
    )
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM request) THEN NULL ELSE jsonb_build_object(
      'filteredTotal',b.total,'page',b.current_page,'pageSize',$7::int,'pageCount',b.pages,
      'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',t.id,'executionKind',t.execution_kind,'promptId',t.prompt_id,'query',t.query_snapshot,
        'surface',t.surface,'device',t.device,'status',t.status,'createdAt',t.created_at,
        'submissionAttemptedAt',t.submission_attempted_at,'submittedAt',t.submitted_at,'completedAt',t.completed_at,
        'estimatedCostUsd',COALESCE(t.estimated_cost_usd,0)::float8,'actualCostUsd',COALESCE(t.actual_cost_usd,0)::float8,
        'errorCode',t.error_code,'errorMessage',t.error_message,'retryOfTaskId',t.retry_of_task_id,
        'retries',COALESCE((SELECT jsonb_agg(jsonb_build_object('requestId',retry.collection_request_id,'taskId',retry.id,'status',retry.status) ORDER BY retry.created_at DESC,retry.id DESC)
          FROM collection_execution_items retry JOIN collection_requests rr ON rr.id=retry.collection_request_id
          WHERE retry.retry_of_task_id=t.id AND retry.execution_kind=t.execution_kind
            AND retry.organization_id=$1 AND retry.brand_id=$2 AND rr.organization_id=$1 AND rr.brand_id=$2),'[]'::jsonb),
        'result',CASE WHEN run.id IS NULL THEN NULL ELSE jsonb_build_object(
          'runId',run.id,'dir',run.source_dir,'filename',run.source_filename,'outcome',run.observation_outcome,
          'answerLength',char_length(run.raw_response),
          'citationCount',CASE WHEN jsonb_typeof(run.original_json->'rawMetadata'->'citations')='array'
            THEN jsonb_array_length(run.original_json->'rawMetadata'->'citations') ELSE 0 END,
          'category',run.original_json->'rawMetadata'->>'category','topic',run.original_json->'rawMetadata'->>'topic'
        ) END
      ) ORDER BY t.created_at ${direction},t.id ${direction}) FROM paged t
      LEFT JOIN LATERAL (
        SELECT p.* FROM prompt_runs p WHERE (p.provider_task_id=t.id OR p.id=t.run_id) AND p.organization_id=$1
        ORDER BY p.run_at DESC,p.id DESC LIMIT 1
      ) run ON true),'[]'::jsonb)) END AS payload FROM bounds b
  `, [organizationId, brandId, requestId, options.status, options.surface, options.q, options.size, options.page, options.from, options.to]);
  return result.payload;
}
