import { getPromptStore } from "@/lib/backend/database";
import { CollectionQueueService } from "./collectionQueue";
import { PostgresCollectionRequestStore } from "./collectionRequestStore";
import { LegacyRetryConflict, retryLegacyRequest } from "./legacyRetry";
import { isRetrySelectable, RETRY_FAILURE_STATUSES, type RetrySelectionItem, type RetrySelectionGroup } from "@/lib/requestRetrySelection";
import { WITHOUT_COLLECTION_RETRY_SQL } from "./collectionActivity";
import type { RequestLogDatabase } from "./requestLog";
import type { CollectStep } from "@/lib/collectSteps";
import type { DataForSeoDevice, DataForSeoSurface } from "./types";
import type { parseRequestItemOptions } from "./requestItems";

export async function listRetryCandidates(org: string, brand: string, requestId: string, group: RetrySelectionGroup | "all", database?: RequestLogDatabase, filters?: ReturnType<typeof parseRequestItemOptions>) {
  const db = database ?? await getPromptStore();
  const [request] = await db.query("SELECT id FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3", [requestId, org, brand]);
  if (!request) return null;
  return db.query<RetrySelectionItem>(`SELECT p.id,p.execution_kind AS "executionKind",p.query_snapshot AS query,p.surface,p.device,p.status,false AS "hasRetry",
    p.estimated_cost_usd::float8 AS "estimatedCostUsd",
    EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=p.id) AS "serverManaged",
    (p.execution_kind='serp-api' AND p.status='reserved' AND EXISTS (SELECT 1 FROM provider_tasks pending WHERE pending.id=p.id AND pending.provider_task_id IS NULL AND pending.submission_attempted_at IS NULL AND (pending.lease_expires_at IS NULL OR pending.lease_expires_at <= $10))) AS "canManagePending"
    FROM collection_execution_items p WHERE p.collection_request_id=$1 AND p.organization_id=$2 AND p.brand_id=$3
      AND (p.status=ANY($4::text[]) OR ($11 AND ((p.execution_kind='legacy' AND (p.status='reserved' OR (p.status='collecting' AND NOT EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=p.id)))) OR (p.execution_kind='serp-api' AND p.status='reserved' AND EXISTS (SELECT 1 FROM provider_tasks pending WHERE pending.id=p.id AND pending.provider_task_id IS NULL AND pending.submission_attempted_at IS NULL AND (pending.lease_expires_at IS NULL OR pending.lease_expires_at <= $10)))))) AND ${WITHOUT_COLLECTION_RETRY_SQL}
      AND ($5::text[] IS NULL OR p.status=ANY($5)) AND ($6::text[] IS NULL OR p.surface=ANY($6))
      AND ($7='' OR strpos(lower(p.query_snapshot),lower($7))>0)
      AND ($8::text IS NULL OR p.created_at >= $8) AND ($9::text IS NULL OR p.created_at < $9)
      AND ($12::text[] IS NULL OR p.device=ANY($12))
      ORDER BY p.created_at,p.id`,
  [requestId, org, brand, group === "all" ? [...RETRY_FAILURE_STATUSES, "cancelled"] : group === "cancelled" ? ["cancelled"] : RETRY_FAILURE_STATUSES, filters?.statuses.length ? filters.statuses : null, filters?.surfaces.length ? filters.surfaces : null, filters?.q ?? "", filters?.from ?? null, filters?.to ?? null, new Date().toISOString(), group === "all", filters?.devices.length ? filters.devices : null]);
}

export async function retrySelectedItems(org: string, brand: string, originalId: string, clientId: string, actor: string | null, ids: string[]) {
  const db = await getPromptStore();
  return db.transaction(async () => {
    const [original] = await db.query("SELECT id FROM collection_requests WHERE id=$1 AND organization_id=$2 AND brand_id=$3 FOR UPDATE", [originalId, org, brand]);
    if (!original) return null;
    await new PostgresCollectionRequestStore().lockClientRequest(org, clientId);
    const duplicate = await db.query("SELECT id FROM collection_requests WHERE organization_id=$1 AND client_request_id=$2", [org, clientId]);
    if (duplicate.length) throw new LegacyRetryConflict("이미 등록된 요청입니다. 수집 로그를 확인해 주세요.");
    await db.query("SELECT id FROM provider_tasks WHERE collection_request_id=$1 AND id::text=ANY($2::text[]) FOR UPDATE", [originalId, ids]);
    await db.query("SELECT id FROM legacy_collection_items WHERE collection_request_id=$1 AND id::text=ANY($2::text[]) FOR UPDATE", [originalId, ids]);
    const items = await db.query<RetrySelectionItem & { promptId: string | null; marketId: string | null }>(`SELECT p.id,p.execution_kind AS "executionKind",p.query_snapshot AS query,p.surface,p.device,p.status,p.prompt_id AS "promptId",
      NOT (${WITHOUT_COLLECTION_RETRY_SQL}) AS "hasRetry",
      EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=p.id) AS "serverManaged",
      (SELECT market_id FROM provider_tasks source WHERE source.id=p.id) AS "marketId"
      FROM collection_execution_items p WHERE p.organization_id=$1 AND p.brand_id=$2 AND p.collection_request_id=$3 AND p.id::text=ANY($4::text[])`, [org, brand, originalId, ids]);
    if (items.some(item => item.hasRetry)) throw new LegacyRetryConflict("이미 재수집이 요청된 항목입니다. 연결된 최신 요청에서 확인해 주세요.");
    if (items.length !== ids.length || items.some(item => !isRetrySelectable(item))) throw new LegacyRetryConflict("선택 항목이 변경되었거나 재수집할 수 없는 상태입니다. 다시 확인해 주세요.");
    const serp = items.filter(item => item.executionKind === "serp-api");
    const local = items.filter(item => item.executionKind === "legacy");
    const localResult = local.length ? await retryLegacyRequest(org, brand, originalId, clientId, actor, { action: "retry", itemIds: local.map(item => item.id) }) : null;
    const steps: CollectStep[] = localResult?.steps ?? [];
    let requestId = localResult?.requestId;
    if (serp.length) {
      const queued = await new CollectionQueueService().appendApproved({ organizationId: org, brandId: brand, requestedBy: actor, clientRequestId: clientId,
        requestKind: "retry", retryOfRequestId: originalId, reuseActive: false,
        tasks: serp.map(item => ({ query: item.query, promptId: item.promptId, surface: item.surface as DataForSeoSurface, device: item.device as DataForSeoDevice,
          marketId: item.marketId ?? "market-kr", scheduledWindow: `manual:${clientId}`, retryOfTaskId: item.id })) });
      requestId = queued.request!.id;
      for (const surface of new Set(serp.map(item => item.surface))) steps.push({ kind: "serp-api", surface: surface as DataForSeoSurface, prompts: [], requestId: clientId,
        taskIds: queued.reservations.filter(item => item.task.surface === surface).map(item => item.task.id) });
    }
    return { requestId, steps, count: items.length, hasSerp: serp.length > 0 };
  });
}
