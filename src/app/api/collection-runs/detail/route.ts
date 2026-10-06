import { NextRequest, NextResponse } from "next/server";
import { getCollectedRunDetail } from "@/lib/backend/collectionRuns";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 수집 로그에서 행을 펼칠 때 그 실행의 원문·인용만 불러온다(목록에는 싣지 않는다).
export async function GET(request: NextRequest) {
  const dir = request.nextUrl.searchParams.get("dir") ?? "";
  const filename = request.nextUrl.searchParams.get("filename") ?? "";
  if (!dir || !filename) return NextResponse.json({ error: "dir과 filename이 필요합니다." }, { status: 400 });
  const detail = await getCollectedRunDetail((await getCurrentTenant()).orgId, dir, filename);
  if (!detail) return NextResponse.json({ error: "실행을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(detail);
}
