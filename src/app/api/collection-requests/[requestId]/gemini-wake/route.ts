import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getPromptStore } from "@/lib/backend/database";
import { dispatchGemini } from "@/lib/backend/llm/geminiDispatch";
import { resolveApiKey } from "@/lib/backend/llm/runner";

export const maxDuration = 180;
export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (!tenant.brandId || body?.confirmed !== true || !Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.length > 2000
    || body.itemIds.some((id: unknown) => typeof id !== "string") || new Set(body.itemIds).size !== body.itemIds.length) return NextResponse.json({ error: "선택 항목을 확인해 주세요." }, { status: 400 });
  const db = await getPromptStore();
  const { requestId } = await params;
  const rows = await db.query<{ client_request_id: string }>(`SELECT r.client_request_id FROM collection_requests r JOIN legacy_collection_items i ON i.collection_request_id=r.id
    JOIN gemini_collection_queue q ON q.item_id=i.id WHERE r.id=$1 AND r.organization_id=$2 AND r.brand_id=$3 AND NOT r.cancel_requested
      AND i.organization_id=$2 AND i.brand_id=$3 AND i.id=ANY($4::text[]) AND i.status='reserved' AND q.started_at IS NULL`, [requestId, tenant.orgId, tenant.brandId, body.itemIds]);
  if (rows.length !== body.itemIds.length) return NextResponse.json({ error: "선택 작업이 변경되었거나 실행 중입니다. 새로고침 후 확인해 주세요." }, { status: 409 });
  try {
    resolveApiKey("GEMINI_API_KEY");
    await dispatchGemini({ organizationId: tenant.orgId, brandId: tenant.brandId, clientRequestId: rows[0].client_request_id }, randomUUID());
  } catch { return NextResponse.json({ error: "서버 실행 연결에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 }); }
  return NextResponse.json({ notice: "Gemini 대기 작업의 실행을 요청했습니다. 새 요청이나 중복 수집은 생성하지 않습니다." });
}
