import { NextRequest, NextResponse } from "next/server";
import { startCollectionJob } from "@/lib/backend/collectionJobRunner";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
  const engines = Array.isArray(body?.engines)
    ? body.engines.filter((e: unknown): e is "naver" | "google" => e === "naver" || e === "google")
    : [];

  if (!keyword) {
    return NextResponse.json({ error: "키워드를 입력해주세요." }, { status: 400 });
  }
  if (engines.length === 0) {
    return NextResponse.json({ error: "엔진을 하나 이상 선택해주세요." }, { status: 400 });
  }

  const job = startCollectionJob(keyword, engines);
  return NextResponse.json({ jobId: job.id });
}
