import { NextRequest, NextResponse } from "next/server";
import { startCollectionJob } from "@/lib/backend/collectionJobRunner";
import { getCurrentTenant } from "@/lib/backend/tenant";

// 실제 수집(Playwright로 네이버/구글 AI검색을 여는 자식 프로세스)은 로컬
// 프로세스 전제로 짜여있어서 Vercel 서버리스에서 못 돈다 — 사이트맵 크롤과
// 같은 이유. 조용히 타임아웃/500으로 죽는 대신 여기서 바로 이유를 준다.
function refuseOnServerless() {
  if (!process.env.VERCEL) return null;
  return NextResponse.json(
    { error: "여기서는 수집을 바로 실행할 수 없어요. 프롬프트 라이브러리에서 프롬프트를 선택하고 '선택 수집'을 누르면 이 PC의 수집기로 수집할 수 있습니다." },
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

  // 결과 파일은 지금 선택된 조직으로 들어간다(작업 기록에 조직을 남김).
  const job = startCollectionJob((await getCurrentTenant()).orgId, keyword, engines);
  return NextResponse.json({ jobId: job.id });
}
