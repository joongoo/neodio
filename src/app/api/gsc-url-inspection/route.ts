import { NextRequest, NextResponse } from "next/server";
import { getRealGscUrlIndexStatus } from "@/lib/backend/gscSearchAnalyticsReader";
import { setCachedUrlIndexStatus } from "@/lib/backend/gscUrlInspectionStore";

import { getCurrentTenant } from "@/lib/backend/tenant";
import { guardApi } from "@/lib/backend/auth/guard";

// 조회·갱신 요청이라 읽기 권한으로 충분하다(viewer도 화면의 배지·차트를 볼 수 있어야 한다).
export async function POST(request: NextRequest) {
  const denied = await guardApi("read");
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
