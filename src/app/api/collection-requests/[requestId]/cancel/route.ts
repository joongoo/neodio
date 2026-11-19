import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { cancelCollectionRequest } from "@/lib/backend/dataforseo/cancelRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  if (body?.confirmed !== true) return NextResponse.json({ error: "취소 확인이 필요합니다." }, { status: 400 });
  const found = tenant.brandId && await cancelCollectionRequest(tenant.orgId, tenant.brandId, (await params).requestId);
  return NextResponse.json(found ? { ok: true } : { error: "수집 요청을 찾을 수 없습니다." }, { status: found ? 200 : 404, headers: { "Cache-Control": "private, no-store" } });
}
