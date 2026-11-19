import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { reviewCollectionRequest } from "@/lib/backend/dataforseo/collectionActivity";

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (body?.reviewed !== true) return NextResponse.json({ error: "확인 완료 요청이 올바르지 않습니다." }, { status: 400 });
  const found = tenant.brandId && await reviewCollectionRequest(tenant.orgId, tenant.brandId, (await params).requestId);
  return found ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } })
    : NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
}
