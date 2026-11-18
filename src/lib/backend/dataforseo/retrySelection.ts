import { getPromptStore } from "@/lib/backend/database";
import { CollectionQueueService } from "./collectionQueue";
import { PostgresCollectionRequestStore } from "./collectionRequestStore";
import { LegacyRetryConflict, retryLegacyRequest } from "./legacyRetry";
import { isRetrySelectable, type RetrySelectionItem } from "@/lib/requestRetrySelection";
import type { CollectStep } from "@/lib/collectSteps";
import type { DataForSeoDevice, DataForSeoSurface } from "./types";

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
    const items = await db.query<RetrySelectionItem & { promptId: string | null; marketId: string | null }>(`SELECT id,execution_kind AS "executionKind",query_snapshot AS query,surface,device,status,prompt_id AS "promptId",
      (SELECT market_id FROM provider_tasks p WHERE p.id=t.id) AS "marketId"
      FROM collection_execution_items t WHERE organization_id=$1 AND brand_id=$2 AND collection_request_id=$3 AND id::text=ANY($4::text[])`, [org, brand, originalId, ids]);
    if (items.length !== ids.length || items.some(item => !isRetrySelectable(item))) throw new LegacyRetryConflict("선택 항목이 변경되었거나 재수집할 수 없는 상태입니다. 다시 확인해 주세요.");
    const serp = items.filter(item => item.executionKind === "serp-api");
    if (serp.length) {
      const active = await db.query(`SELECT id FROM provider_tasks WHERE retry_of_task_id::text=ANY($1::text[]) AND status NOT IN ('completed','provider_failed','parse_failed','cancelled') LIMIT 1`, [serp.map(item => item.id)]);
      if (active.length) throw new LegacyRetryConflict("선택 항목의 재수집이 이미 진행 중입니다.");
    }
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
