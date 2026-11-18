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
      AND i.organization_id=$3 AND i.brand_id=$4 AND i.run_id IS NULL AND i.status IN ('reserved','collecting')`,
  [new Date().toISOString(), leaving, org, brand, requestId]);
}
