import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { listRequestLogs, parseRequestLogOptions, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  if (!tenant.brandId) return NextResponse.json({ error: "브랜드를 선택해 주세요." }, { status: 400 });
  try {
    const options = parseRequestLogOptions(request.nextUrl.searchParams);
    return NextResponse.json(await listRequestLogs(tenant.orgId, tenant.brandId, options));
  } catch (error) {
    if (error instanceof RequestLogInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
