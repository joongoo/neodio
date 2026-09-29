import { NextRequest, NextResponse } from "next/server";
import { collectorDownloadUrl } from "@/lib/backend/collectionMode";
import { COLLECTOR_PLATFORM_LABEL, type CollectorPlatform } from "@/lib/collectorAgent";

// 선택 수집의 "수집기 받기" — 운영체제별 설치 파일로 보낸다.
export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") as CollectorPlatform | null;
  if (!platform || !(platform in COLLECTOR_PLATFORM_LABEL)) {
    return NextResponse.json({ error: "지원하지 않는 운영체제입니다." }, { status: 400 });
  }
  const url = collectorDownloadUrl(platform);
  if (!url) return NextResponse.json({ error: "수집기 설치 파일이 아직 등록되지 않았습니다." }, { status: 404 });
  return NextResponse.redirect(url);
}
