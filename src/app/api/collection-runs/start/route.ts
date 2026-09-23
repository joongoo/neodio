import { NextRequest, NextResponse } from "next/server";
import { startCollectionJob } from "@/lib/backend/collectionJobRunner";

// 실제 수집(Playwright로 네이버/구글 AI검색을 여는 자식 프로세스)은 로컬
// 프로세스 전제로 짜여있어서 Vercel 서버리스에서 못 돈다 — 사이트맵 크롤과
// 같은 이유. 조용히 타임아웃/500으로 죽는 대신 여기서 바로 이유를 준다.
function refuseOnServerless() {
  if (!process.env.VERCEL) return null;
  return NextResponse.json(
    { error: "AI검색 수집은 로컬 개발 환경에서만 실행할 수 있어요. 로컬에서 `npm run collect:naver-ai` / `collect:google-ai`를 실행해주세요." },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  const refused = refuseOnServerless();
  if (refused) return refused;
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
