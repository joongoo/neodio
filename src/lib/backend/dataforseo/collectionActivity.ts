import { getPromptStore } from "@/lib/backend/database";
import { COLLECTION_ATTENTION_STATUSES } from "@/lib/collectionAttention";
import type { RequestLogDatabase } from "./requestLog";
import type { ProviderTaskActivitySummary } from "./taskStore";

// Keep badge and request shortcut consistent, including execution kind and tenant.
export const WITHOUT_COLLECTION_RETRY_SQL = `NOT EXISTS (
  SELECT 1 FROM collection_execution_items retry WHERE retry.retry_of_task_id=p.id
    AND retry.execution_kind=p.execution_kind
    AND retry.organization_id=p.organization_id AND retry.brand_id=p.brand_id
)`;

export const WITHOUT_REVIEWED_REQUEST_SQL = `NOT EXISTS (
  SELECT 1 FROM collection_requests reviewed WHERE reviewed.id=p.collection_request_id
    AND reviewed.organization_id=p.organization_id AND reviewed.brand_id=p.brand_id AND (reviewed.attention_reviewed OR reviewed.cancel_requested)
)`;

/** Sidebar excludes unsubmitted reservations; worker activity below still includes them. */
export async function getCollectionActivityFlags(organizationId: string, brandId: string, database?: RequestLogDatabase): Promise<{ running: boolean; attention: boolean; cancelling?: boolean }> {
  const db = database ?? await getPromptStore();
  const [row] = await db.query<{ running: boolean; attention: boolean; cancelling: boolean }>(`SELECT
    EXISTS(SELECT 1 FROM collection_execution_items p JOIN collection_requests r ON r.id=p.collection_request_id
      AND r.organization_id=p.organization_id AND r.brand_id=p.brand_id WHERE p.organization_id=$1 AND p.brand_id=$2
      AND r.cancel_requested AND p.status=ANY($3::text[])) AS cancelling,
    EXISTS(SELECT 1 FROM collection_execution_items p WHERE p.organization_id=$1 AND p.brand_id=$2
      AND (p.execution_kind='serp-api' OR EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=p.id) OR EXISTS(SELECT 1 FROM collection_requests cancelling WHERE cancelling.id=p.collection_request_id
        AND cancelling.organization_id=p.organization_id AND cancelling.brand_id=p.brand_id AND cancelling.cancel_requested)) AND p.status=ANY($3::text[])) AS running,
    EXISTS(SELECT 1 FROM collection_execution_items p WHERE p.organization_id=$1 AND p.brand_id=$2
      AND p.status=ANY($4::text[]) AND ${WITHOUT_COLLECTION_RETRY_SQL} AND ${WITHOUT_REVIEWED_REQUEST_SQL}) AS attention`,
  [organizationId, brandId, ["submitting", "queued", "collecting", "raw_saved", "normalized", "artifact_failed", "projection_failed"], COLLECTION_ATTENTION_STATUSES]);
  return { running: !!row?.running, attention: !!row?.attention, ...(row?.cancelling ? { cancelling: true } : {}) };
}

export async function getCollectionActivitySummary(organizationId: string, brandId: string, database?: RequestLogDatabase): Promise<ProviderTaskActivitySummary> {
  const db = database ?? await getPromptStore();
  const [row] = await db.query<{ running_count: number; attention_count: number }>(`SELECT
    count(*) FILTER (WHERE p.execution_kind='serp-api' AND p.status=ANY($3::text[]))::int AS running_count,
    count(*) FILTER (WHERE p.status=ANY($4::text[]) AND ${WITHOUT_COLLECTION_RETRY_SQL} AND ${WITHOUT_REVIEWED_REQUEST_SQL})::int AS attention_count
    FROM collection_execution_items p WHERE p.organization_id=$1 AND p.brand_id=$2`,
  [organizationId, brandId, ["reserved", "submitting", "queued", "collecting", "raw_saved", "normalized", "artifact_failed", "projection_failed"], COLLECTION_ATTENTION_STATUSES]);
  return { runningCount: Number(row?.running_count ?? 0), attentionCount: Number(row?.attention_count ?? 0) };
}

export async function getRequestAttentionCount(org: string, brand: string, database?: RequestLogDatabase): Promise<number> {
  const db = database ?? await getPromptStore();
  const [row] = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM collection_requests r
    WHERE r.organization_id=$1 AND r.brand_id=$2 AND NOT r.attention_reviewed AND NOT r.cancel_requested AND EXISTS (
      SELECT 1 FROM collection_execution_items p WHERE p.collection_request_id=r.id
        AND p.organization_id=r.organization_id AND p.brand_id=r.brand_id
        AND p.status=ANY($3::text[]) AND ${WITHOUT_COLLECTION_RETRY_SQL})`, [org, brand, COLLECTION_ATTENTION_STATUSES]);
  return Number(row?.count ?? 0);
}

export async function reviewCollectionRequest(org: string, brand: string, requestId: string, database?: RequestLogDatabase): Promise<boolean> {
  const db = database ?? await getPromptStore();
  const rows = await db.query(`UPDATE collection_requests SET attention_reviewed=true
    WHERE id=$1 AND organization_id=$2 AND brand_id=$3 RETURNING id`, [requestId, org, brand]);
  return rows.length > 0;
}
