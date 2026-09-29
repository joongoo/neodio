import { NextRequest, NextResponse } from "next/server";
import { collectorDownloadUrl } from "@/lib/backend/collectionMode";
import { COLLECTOR_PLATFORM_LABEL, type CollectorPlatform } from "@/lib/collectorAgent";

// 선택 수집의 "수집기 받기" — 비공개 저장소의 설치 파일로 가는 임시 링크를 만들어 보낸다.
// 이 경로는 사이트 로그인(Basic Auth) 뒤에 있어 로그인한 사람만 받을 수 있다.
export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") as CollectorPlatform | null;
  if (!platform || !(platform in COLLECTOR_PLATFORM_LABEL)) {
    return NextResponse.json({ error: "지원하지 않는 운영체제입니다." }, { status: 400 });
  }
  const url = await collectorDownloadUrl(platform);
  if (!url) return NextResponse.json({ error: "수집기 설치 파일이 아직 등록되지 않았습니다." }, { status: 404 });
  return NextResponse.redirect(url);
}
