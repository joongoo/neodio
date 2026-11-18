import { randomUUID } from "node:crypto";
import { getPromptStore } from "@/lib/backend/database";
import { PostgresCollectionRequestStore } from "./collectionRequestStore";
import type { PromptRunSeed } from "@/lib/db/types";

export interface LegacyPlannedItem { query: string; surface: string; device: string; promptId?: string }
const sources: Record<string, string> = { "naver-ai-search": "naver-ai", "naver-overview": "naver-aio", "google-ai-overview": "google-ai-mode", "google-aio": "google-aio", api: "gemini" };

export async function registerLegacyRequest(org: string, brand: string, clientId: string, actor: string | null, items: LegacyPlannedItem[], retryOfRequestId?: string) {
  const db = await getPromptStore();
  return db.transaction(async () => {
    const requests = new PostgresCollectionRequestStore();
    await requests.lockClientRequest(org, clientId);
    let request = await requests.getByClientRequestId(org, clientId);
    if (request && request.brandId !== brand) throw new Error("수집 요청의 브랜드가 일치하지 않습니다.");
    if (!request) request = await requests.create({ organizationId: org, brandId: brand, clientRequestId: clientId, requestedBy: actor, requestKind: retryOfRequestId ? "retry" : "manual", retryOfRequestId, totalTaskCount: items.length, estimatedCostUsd: 0 });
    let created = 0;
    for (const item of items) {
      const rows = await db.query(`INSERT INTO legacy_collection_items(id,organization_id,brand_id,collection_request_id,prompt_id,query_snapshot,surface,device,created_at,last_seen_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(collection_request_id,query_snapshot,surface,device) DO NOTHING RETURNING id`,
      [`legacy-${randomUUID()}`, org, brand, request.id, item.promptId ?? null, item.query, item.surface, item.device, new Date().toISOString()]);
      created += rows.length;
    }
    // New requests already include their planned item count.
    await db.query(`UPDATE collection_requests SET total_task_count=(SELECT count(*) FROM collection_execution_items WHERE collection_request_id=$1) WHERE id=$1`, [request.id]);
    return { requestId: request.id, created };
  });
}

/** Explicit request identity, never infer membership from timestamps. */
export async function linkLegacyRun(org: string, brand: string, clientId: string | undefined, run: PromptRunSeed, device = "desktop") {
  if (!clientId) return;
  const db = await getPromptStore();
  await db.query(`UPDATE legacy_collection_items i SET run_id=$1,status=$2,completed_at=$3,error_message=$4
    FROM collection_requests r WHERE r.id=i.collection_request_id AND r.organization_id=$5 AND r.brand_id=$6
      AND i.organization_id=$5 AND i.brand_id=$6
      AND r.client_request_id=$7 AND i.query_snapshot=$8 AND i.surface=$9 AND i.device=$10`,
  [run.id, run.status === "success" || run.rawMetadata.errorMessage?.startsWith("empty_") ? "completed" : "parse_failed",
    run.runAt, run.rawMetadata.errorMessage ?? null, org, brand, clientId, run.rawMetadata.query,
    sources[run.rawMetadata.source] ?? run.rawMetadata.source, device]);
}
