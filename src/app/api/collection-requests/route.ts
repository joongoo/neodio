import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { listRequestLogs, parseRequestLogOptions, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { getRequestAttentionCount } from "@/lib/backend/dataforseo/collectionActivity";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  if (!tenant.brandId) return NextResponse.json({ error: "브랜드를 선택해 주세요." }, { status: 400 });
  try {
    const options = parseRequestLogOptions(request.nextUrl.searchParams);
    const [data, attentionCount] = await Promise.all([listRequestLogs(tenant.orgId, tenant.brandId, options), getRequestAttentionCount(tenant.orgId, tenant.brandId)]);
    return NextResponse.json({ ...data, attentionCount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestLogInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
