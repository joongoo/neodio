import { NextRequest, NextResponse } from "next/server";
import { cancelAioJob, getAioJob, getLatestAioJob, getRunningAioJob, startAioJob } from "@/lib/backend/aio/jobRunner";
import { listAioKeywords } from "@/lib/backend/aio/store";
import { listBrandYoutubeChannels } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { collectionUsesLocalAgent } from "@/lib/backend/collectionMode";
import { planAioRun } from "@/lib/backend/aio/collector";

// YouTube AIO 인용 화면의 "지금 수집" — 실제 Chrome으로 Google을 여는 일이라 이 서버가 직접 하는 건 로컬 개발뿐이다.
// 운영(Vercel 서버리스)은 Chrome이 없어서, 서버는 무엇을 수집할지 계획(키워드 × 디바이스, 오늘 수집한 건 제외)만 짜서
// 돌려주고 사용자 PC의 설치형 수집기가 검색한다. 결과는 화면이 /api/youtube-aio/import로 올려 서버가 판정·저장한다
// (src/lib/aioCollectClient.ts).
// 검색 사이 간격: 정기 수집(3~8분)보다 짧게 잡되, Phase 0에서 캡차가 뜬 20~40초보다는 길게.
const AGENT_MIN_DELAY_MS = 60_000;
const AGENT_MAX_DELAY_MS = 120_000;

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();

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
  if (keywordId && !keyword) return NextResponse.json({ error: "프롬프트를 찾을 수 없습니다." }, { status: 404 });
  if (keywords.length === 0) return NextResponse.json({ error: "수집할 프롬프트가 없습니다." }, { status: 400 });

  if (collectionUsesLocalAgent()) {
    const planned = await planAioRun({ brandId, keywordIds: keyword ? [keyword.id] : undefined, force: keyword ? true : body?.force === true });
    if ("skippedReason" in planned) return NextResponse.json({ error: planned.skippedReason }, { status: 400 });
    const { plan } = planned;
    if (plan.tasks.length === 0) {
      return NextResponse.json({ error: "오늘 이미 모두 수집했습니다. 다시 수집하려면 \"오늘 이미 수집한 프롬프트도 다시 수집\"을 선택하세요." }, { status: 400 });
    }
    return NextResponse.json({
      agent: {
        brandId,
        label: keyword ? keyword.keyword : "전체 프롬프트",
        country: plan.settings.country,
        language: plan.settings.language,
        minDelayMs: AGENT_MIN_DELAY_MS,
        maxDelayMs: AGENT_MAX_DELAY_MS,
        tasks: plan.tasks.map((t) => ({ keywordId: t.keyword.id, keyword: t.keyword.keyword, device: t.device })),
      },
    });
  }

  const running = getRunningAioJob();
  if (running) {
    return NextResponse.json({ error: `이미 수집 중입니다 (${running.label}). 끝난 뒤 다시 시도하세요.`, jobId: running.id }, { status: 409 });
  }

  // 키워드 하나를 "지금" 수집하는 건 오늘 이미 수집했어도 다시 보려는 것이다.
  const job = startAioJob({
    brandId,
    keywordIds: keyword ? [keyword.id] : undefined,
    label: keyword ? keyword.keyword : "전체 프롬프트",
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
