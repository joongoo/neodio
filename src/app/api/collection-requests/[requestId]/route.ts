import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getRequestLog } from "@/lib/backend/dataforseo/requestLog";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const { requestId } = await context.params;
  const request = tenant.brandId ? await getRequestLog(tenant.orgId, tenant.brandId, requestId) : null;
  if (!request) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ request });
}
