import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { listRequestItems, parseRequestItemOptions } from "@/lib/backend/dataforseo/requestItems";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const { requestId } = await context.params;
  try {
    const options = parseRequestItemOptions(request.nextUrl.searchParams);
    const page = tenant.brandId ? await listRequestItems(tenant.orgId, tenant.brandId, requestId, options) : null;
    if (!page) return NextResponse.json({ error: "수집 요청을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof RequestLogInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
