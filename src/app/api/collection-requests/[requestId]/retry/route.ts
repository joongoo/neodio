import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { retrySelectedItems, listRetryCandidates } from "@/lib/backend/dataforseo/retrySelection";
import { LegacyRetryConflict } from "@/lib/backend/dataforseo/legacyRetry";
import { publishDataForSeoWake } from "@/lib/backend/dataforseo/queueWake";
import { parseRequestItemOptions } from "@/lib/backend/dataforseo/requestItems";
import { RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant(), id = (await params).requestId;
  const group = request.nextUrl.searchParams.get("group") ?? "failed";
  if (group !== "failed" && group !== "cancelled") return NextResponse.json({ error: "선택 그룹이 올바르지 않습니다." }, { status: 400 });
  let filters;
  try { filters = parseRequestItemOptions(request.nextUrl.searchParams); }
  catch (error) { if (error instanceof RequestLogInputError) return NextResponse.json({ error: error.message }, { status: 400 }); throw error; }
  const items = await listRetryCandidates(tenant.orgId, tenant.brandId, id, group, undefined, filters);
  if (!items) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
  if (items.length > 2000) return NextResponse.json({ error: "한 번에 최대 2,000건까지 선택할 수 있습니다. 개별 선택해 주세요." }, { status: 400 });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant(), body = await request.json().catch(() => null);
  if (body?.confirmed !== true || typeof body.clientRequestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.clientRequestId) || !Array.isArray(body.itemIds) || !body.itemIds.length || body.itemIds.length > 2000 || body.itemIds.some((id: unknown) => typeof id !== "string" || !id.length) || new Set(body.itemIds).size !== body.itemIds.length) return NextResponse.json({ error: "선택 항목과 비용 승인을 확인해 주세요." }, { status: 400 });
  try {
    const result = await retrySelectedItems(tenant.orgId, tenant.brandId, (await params).requestId, body.clientRequestId, (await getCurrentUser())?.id ?? null, body.itemIds);
    if (!result) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    let notice: string | null = null;
    if (result.hasSerp) {
      try { await publishDataForSeoWake({ version: 1, organizationId: tenant.orgId, brandId: tenant.brandId, clientRequestId: body.clientRequestId, idempotencySeed: `retry:${body.clientRequestId}` }); }
      catch { notice = "작업은 저장되었으나 실행 알림을 보내지 못했습니다. 수집 로그에서 확인해 주세요."; }
    }
    return NextResponse.json({ ...result, notice });
  } catch (error) {
    if (error instanceof LegacyRetryConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
