import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getRequestLog, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { listRequestItems, parseRequestItemOptions } from "@/lib/backend/dataforseo/requestItems";

export const runtime = "nodejs";

// DB reads only: never wakes a worker or calls a provider API.
export async function GET(request: NextRequest, { params }: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant(), id = (await params).requestId;
  try {
    const options = parseRequestItemOptions(request.nextUrl.searchParams);
    const summary = tenant.brandId ? await getRequestLog(tenant.orgId, tenant.brandId, id) : null;
    if (!summary) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    const items = await listRequestItems(tenant.orgId, tenant.brandId, id, options);
    if (!items) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ request: summary, items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RequestLogInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
