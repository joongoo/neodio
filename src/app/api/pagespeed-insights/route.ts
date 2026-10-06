import { NextRequest, NextResponse } from "next/server";
import { getRealPageSpeedInsights } from "@/lib/backend/pageSpeedInsightsReader";
import { setCachedPageSpeedResult } from "@/lib/backend/pageSpeedInsightsStore";
import { guardApi } from "@/lib/backend/auth/guard";

// 조회·갱신 요청이라 읽기 권한으로 충분하다(viewer도 화면의 배지·차트를 볼 수 있어야 한다).
export async function POST(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });
  }

  const result = await getRealPageSpeedInsights(url);
  if (!result) {
    return NextResponse.json({ error: "PageSpeed API 키가 설정돼 있지 않거나 조회에 실패했습니다." }, { status: 400 });
  }

  await setCachedPageSpeedResult(url, result);
  return NextResponse.json({ result });
}
