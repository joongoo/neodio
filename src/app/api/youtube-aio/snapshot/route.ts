import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAioScreenshotPath } from "@/lib/backend/aio/store";

// 수집 당시 SERP 스크린샷(AIO 증빙) — 수집기가 .tmp/google-aio 아래에
// 저장한 파일만 내준다. DB 경로를 그대로 믿지 않고 그 디렉터리 밖이면 거부.
const SNAPSHOT_ROOT = path.resolve(".tmp", "google-aio");

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");
  const observationId = request.nextUrl.searchParams.get("id");
  if (!brandId || !observationId) return NextResponse.json({ error: "brandId와 id가 필요합니다." }, { status: 400 });

  const stored = await getAioScreenshotPath(brandId, observationId);
  if (!stored) return NextResponse.json({ error: "스냅샷이 없습니다." }, { status: 404 });
  const resolved = path.resolve(stored);
  if (!resolved.startsWith(SNAPSHOT_ROOT + path.sep) || path.extname(resolved) !== ".png") {
    return NextResponse.json({ error: "스냅샷 경로가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const image = await readFile(resolved);
    return new NextResponse(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "스냅샷 파일을 찾을 수 없습니다. 수집한 서버에만 보관됩니다." }, { status: 404 });
  }
}
