import { NextRequest, NextResponse } from "next/server";
import { cancelCollectionJob } from "@/lib/backend/collectionJobRunner";
import { requestCollectionCancel } from "@/lib/backend/collectionQueue";

// 이 서버 프로세스가 직접 돌리는 작업이면 바로 멈추고, 수집 PC 워커의 작업이면
// 운영 DB에 중단 요청을 남긴다(대기 중이면 즉시 취소, 실행 중이면 워커가 보고 멈춤).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const jobIds: string[] = (Array.isArray(body?.jobIds) ? body.jobIds : [body?.jobId]).filter(
    (id: unknown): id is string => typeof id === "string" && id.length > 0
  );
  if (jobIds.length === 0) {
    return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  }

  let affected = 0;
  for (const jobId of jobIds) {
    if (cancelCollectionJob(jobId) || (await requestCollectionCancel(jobId))) affected++;
  }
  if (affected === 0) {
    return NextResponse.json({ error: "이미 끝났거나 존재하지 않는 작업입니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, cancelled: affected });
}
