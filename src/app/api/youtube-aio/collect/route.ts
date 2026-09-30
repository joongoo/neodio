import { NextRequest, NextResponse } from "next/server";
import { cancelAioJob, getAioJob, getLatestAioJob, getRunningAioJob, startAioJob } from "@/lib/backend/aio/jobRunner";
import { listAioKeywords } from "@/lib/backend/aio/store";
import { listBrandYoutubeChannels } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";

// YouTube AIO 인용 화면의 "지금 수집" — 실제 Chrome으로 Google을 여는
// 자식 프로세스라 로컬(또는 Chrome이 설치된 서버)에서만 돈다. 수집 로그의
// collection-runs/start와 같은 이유로 Vercel 서버리스에서는 바로 거절한다.
function refuseOnServerless() {
  if (!process.env.VERCEL) return null;
  return NextResponse.json(
    { error: "지금 이 환경에서는 AIO 수집을 바로 실행할 수 없어요. 정기 수집이 돌면 지표가 채워집니다." },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const refused = refuseOnServerless();
  if (refused) return refused;

  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const keywordId = typeof body?.keywordId === "string" ? body.keywordId : null;
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  if ((await listBrandYoutubeChannels(brandId)).length === 0) {
    return NextResponse.json({ error: "YouTube 채널을 먼저 연동하세요." }, { status: 400 });
  }
  const keywords = await listAioKeywords(brandId);
  const keyword = keywordId ? keywords.find((k) => k.id === keywordId) : null;
  if (keywordId && !keyword) return NextResponse.json({ error: "키워드를 찾을 수 없습니다." }, { status: 404 });
  if (keywords.length === 0) return NextResponse.json({ error: "수집할 키워드가 없습니다." }, { status: 400 });

  const running = getRunningAioJob();
  if (running) {
    return NextResponse.json({ error: `이미 수집 중입니다 (${running.label}). 끝난 뒤 다시 시도하세요.`, jobId: running.id }, { status: 409 });
  }

  // 키워드 하나를 "지금" 수집하는 건 오늘 이미 수집했어도 다시 보려는 것이다.
  const job = startAioJob({
    brandId,
    keywordIds: keyword ? [keyword.id] : undefined,
    label: keyword ? keyword.keyword : "전체 키워드",
    force: keyword ? true : body?.force === true,
  });
  return NextResponse.json({ job });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const brandId = request.nextUrl.searchParams.get("brandId");
  if (jobId) {
    const job = getAioJob(jobId);
    return job ? NextResponse.json({ job }) : NextResponse.json({ error: "존재하지 않거나 만료된 작업입니다." }, { status: 404 });
  }
  if (brandId) return NextResponse.json({ job: getLatestAioJob(brandId) ?? null });
  return NextResponse.json({ error: "jobId 또는 brandId가 필요합니다." }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  if (!cancelAioJob(jobId)) return NextResponse.json({ error: "이미 끝났거나 존재하지 않는 작업입니다." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
