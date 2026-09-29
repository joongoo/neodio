import { NextRequest, NextResponse } from "next/server";
import { startCollectionJob } from "@/lib/backend/collectionJobRunner";
import { collectionRunsRemotely, enqueueCollectionJobs } from "@/lib/backend/collectionQueue";
import { getCurrentTenant } from "@/lib/backend/tenant";

const MAX_KEYWORDS_PER_REQUEST = 100;

// 실제 수집(Playwright로 네이버/구글 AI검색을 여는 자식 프로세스)은 Chrome이
// 있는 PC에서만 돈다. 로컬 대시보드는 여기서 바로 실행하고, 운영(Vercel)은
// 대기열에 올려 수집 PC의 워커(scripts/collection-worker.ts)가 가져가게 한다.
//
// body: { keyword } 하나, 또는 { keywords: [...] } 여러 개(대기열 모드에서만 —
// 로컬 실행은 브라우저를 띄우는 무거운 작업이라 화면이 하나씩 순서대로 보낸다).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const rawKeywords: unknown[] = Array.isArray(body?.keywords) ? body.keywords : [body?.keyword];
  const keywords = rawKeywords.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean);
  const engines = Array.isArray(body?.engines)
    ? body.engines.filter((e: unknown): e is "naver" | "google" => e === "naver" || e === "google")
    : [];

  if (keywords.length === 0) {
    return NextResponse.json({ error: "키워드를 입력해주세요." }, { status: 400 });
  }
  if (engines.length === 0) {
    return NextResponse.json({ error: "엔진을 하나 이상 선택해주세요." }, { status: 400 });
  }

  // 결과는 지금 선택된 조직으로 들어간다(작업 기록에 조직을 남김).
  const orgId = (await getCurrentTenant()).orgId;

  if (collectionRunsRemotely()) {
    if (keywords.length > MAX_KEYWORDS_PER_REQUEST) {
      return NextResponse.json({ error: `한 번에 최대 ${MAX_KEYWORDS_PER_REQUEST}개까지 수집할 수 있습니다.` }, { status: 400 });
    }
    const jobs = await enqueueCollectionJobs(orgId, keywords, engines);
    return NextResponse.json({ jobId: jobs[0].id, jobIds: jobs.map((job) => job.id), queued: true });
  }

  if (keywords.length > 1) {
    return NextResponse.json({ error: "한 번에 하나의 키워드만 수집할 수 있습니다." }, { status: 400 });
  }
  const job = startCollectionJob(orgId, keywords[0], engines);
  return NextResponse.json({ jobId: job.id, jobIds: [job.id], queued: false });
}
