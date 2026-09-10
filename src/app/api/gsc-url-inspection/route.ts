import { NextRequest, NextResponse } from "next/server";
import { getRealGscUrlIndexStatus } from "@/lib/backend/gscSearchAnalyticsReader";
import { setCachedUrlIndexStatus } from "@/lib/backend/gscUrlInspectionStore";

const OWN_BRAND_ID = "brand-neodigm";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });
  }

  const status = await getRealGscUrlIndexStatus(OWN_BRAND_ID, url);
  if (!status) {
    return NextResponse.json({ error: "GSC가 연결돼 있지 않거나 조회에 실패했습니다." }, { status: 400 });
  }

  await setCachedUrlIndexStatus(url, status);
  return NextResponse.json({ status });
}
