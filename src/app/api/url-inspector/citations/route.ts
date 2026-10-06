import { NextRequest, NextResponse } from "next/server";
import { getRealUrlCitedPrompts } from "@/lib/backend/collectionStatsReader";

// URL 인스펙터에서 행을 펼칠 때 그 URL을 인용한 프롬프트 실행 목록만 불러온다.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!url) return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });
  return NextResponse.json(await getRealUrlCitedPrompts(url));
}
