import { NextRequest, NextResponse } from "next/server";
import { cancelCollectionJob } from "@/lib/backend/collectionJobRunner";
import { guardApi } from "@/lib/backend/auth/guard";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  if (!jobId) {
    return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  }

  const cancelled = cancelCollectionJob(jobId);
  if (!cancelled) {
    return NextResponse.json({ error: "이미 끝났거나 존재하지 않는 작업입니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
