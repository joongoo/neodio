import { getPromptStore } from "@/lib/backend/database";

export async function reportLegacySession(org: string, brand: string, requestId: string, action: "heartbeat" | "leave") {
  const leaving = action === "leave";
  await (await getPromptStore()).query(`UPDATE legacy_collection_items i
    SET last_seen_at=$1,
      status=CASE WHEN $2 AND i.status='collecting' THEN 'cancelled' ELSE i.status END,
      completed_at=CASE WHEN $2 AND i.status='collecting' THEN $1 ELSE i.completed_at END,
      error_message=CASE WHEN $2 AND i.status='collecting' THEN '페이지 이탈로 중단되었습니다. 요청 상세에서 다시 시도할 수 있습니다.' ELSE i.error_message END
    FROM collection_requests r WHERE r.id=i.collection_request_id
      AND r.organization_id=$3 AND r.brand_id=$4 AND r.client_request_id=$5
      AND i.organization_id=$3 AND i.brand_id=$4 AND i.run_id IS NULL AND i.status IN ('reserved','collecting')
      AND NOT EXISTS(SELECT 1 FROM gemini_collection_queue q WHERE q.item_id=i.id)`,
  [new Date().toISOString(), leaving, org, brand, requestId]);
  const [request] = await (await getPromptStore()).query<{ cancel_requested: boolean }>(
    "SELECT cancel_requested FROM collection_requests WHERE organization_id=$1 AND brand_id=$2 AND client_request_id=$3", [org, brand, requestId]);
  return { cancelRequested: request?.cancel_requested === true };
}
