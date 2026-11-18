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

export async function getCollectionActivitySummary(organizationId: string, brandId: string, database?: RequestLogDatabase): Promise<ProviderTaskActivitySummary> {
  const db = database ?? await getPromptStore();
  const [row] = await db.query<{ running_count: number; attention_count: number }>(`SELECT
    count(*) FILTER (WHERE p.execution_kind='serp-api' AND p.status=ANY($3::text[]))::int AS running_count,
    count(*) FILTER (WHERE p.status=ANY($4::text[]) AND ${WITHOUT_COLLECTION_RETRY_SQL})::int AS attention_count
    FROM collection_execution_items p WHERE p.organization_id=$1 AND p.brand_id=$2`,
  [organizationId, brandId, ["reserved", "submitting", "queued", "collecting", "raw_saved", "normalized", "artifact_failed", "projection_failed"], COLLECTION_ATTENTION_STATUSES]);
  return { runningCount: Number(row?.running_count ?? 0), attentionCount: Number(row?.attention_count ?? 0) };
}
