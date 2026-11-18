import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getPromptStore } from "@/lib/backend/database";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (typeof body?.requestId !== "string" || !["heartbeat", "leave"].includes(body?.action)) return NextResponse.json({ error: "잘못된 세션 요청입니다." }, { status: 400 });
  const leaving = body.action === "leave";
  await (await getPromptStore()).query(`UPDATE legacy_collection_items i
    SET last_seen_at=$1,status=CASE WHEN $2 THEN 'cancelled' ELSE i.status END,
      completed_at=CASE WHEN $2 THEN $1 ELSE i.completed_at END,
      error_message=CASE WHEN $2 THEN '페이지 이탈로 중단되었습니다. 요청 상세에서 다시 시도할 수 있습니다.' ELSE i.error_message END
    FROM collection_requests r WHERE r.id=i.collection_request_id
      AND r.organization_id=$3 AND r.brand_id=$4 AND r.client_request_id=$5
      AND i.organization_id=$3 AND i.brand_id=$4 AND i.run_id IS NULL AND i.status IN ('reserved','collecting')`,
  [new Date().toISOString(), leaving, tenant.orgId, tenant.brandId, body.requestId]);
  return NextResponse.json({ ok: true });
}
