import { NextRequest, NextResponse } from "next/server";
import { getRealGscUrlIndexStatus } from "@/lib/backend/gscSearchAnalyticsReader";
import { setCachedUrlIndexStatus } from "@/lib/backend/gscUrlInspectionStore";

import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });
  }

  const status = await getRealGscUrlIndexStatus(tenant.brandId, url);
  if (!status) {
    return NextResponse.json({ error: "GSC가 연결돼 있지 않거나 조회에 실패했습니다." }, { status: 400 });
  }

  await setCachedUrlIndexStatus(tenant.orgId, url, status);
  return NextResponse.json({ status });
}
