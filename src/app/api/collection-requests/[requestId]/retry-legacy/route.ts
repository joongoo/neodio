import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { retryLegacyRequest, LegacyRetryConflict } from "@/lib/backend/dataforseo/legacyRetry";

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (typeof body?.clientRequestId !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(body.clientRequestId) || body.confirmed !== true) return NextResponse.json({ error: "재시도 확인이 필요합니다." }, { status: 400 });
  try {
    const result = await retryLegacyRequest(tenant.orgId, tenant.brandId, (await params).requestId, body.clientRequestId, (await getCurrentUser())?.id ?? null);
    if (!result) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LegacyRetryConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
