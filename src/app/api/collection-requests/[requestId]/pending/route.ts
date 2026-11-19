import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { managePendingSerpItems } from "@/lib/backend/dataforseo/pendingSelection";
import { LegacyRetryConflict } from "@/lib/backend/dataforseo/legacyRetry";
import { publishDataForSeoWake } from "@/lib/backend/dataforseo/queueWake";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant(), body = await request.json().catch(() => null);
  if (body?.confirmed !== true || !["wake", "cancel"].includes(body.action) || typeof body.clientRequestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.clientRequestId) || !Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.some((id: unknown) => typeof id !== "string" || !id.length) || new Set(body.itemIds).size !== body.itemIds.length) return NextResponse.json({ error: "선택 항목과 실행·취소 확인을 확인해 주세요." }, { status: 400 });
  try {
    const result = await managePendingSerpItems(tenant.orgId, tenant.brandId, (await params).requestId, body.itemIds, body.action);
    if (!result) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    let published = false;
    let notice = "선택한 미제출 작업을 취소했습니다. 이력은 유지됩니다.";
    if (body.action === "wake") {
      notice = process.env.DATAFORSEO_EXECUTOR === "local"
        ? "기존 대기 작업을 유지했습니다. 로컬 worker를 실행하면 큐 순서와 동시 실행 제한에 따라 처리합니다."
        : "이 환경에서 실행 알림을 발행할 수 없습니다. 대기 작업은 보존되었으며 큐 설정과 worker 상태를 확인해 주세요.";
      try {
        const wake = await publishDataForSeoWake({ version: 1, organizationId: tenant.orgId, brandId: tenant.brandId, clientRequestId: result.clientRequestId, idempotencySeed: `manual-start:${body.clientRequestId}` });
        published = wake.published;
        if (published) notice = "worker에 실행 확인을 요청했습니다. 기존 큐 순서와 동시 실행 제한에 따라 처리하며 즉시 제출을 보장하지 않습니다.";
      } catch { notice = "실행 알림을 보내지 못했습니다. 기존 대기 작업은 보존되었으며 새 작업이나 유료 재제출은 생성하지 않았습니다. 잠시 후 다시 실행 요청해 주세요."; }
    }
    return NextResponse.json({ ...result, published, notice });
  } catch (error) {
    if (error instanceof LegacyRetryConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
