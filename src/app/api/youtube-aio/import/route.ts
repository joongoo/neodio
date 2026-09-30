import { NextRequest, NextResponse } from "next/server";
import { buildJudgeContext } from "@/lib/backend/aio/judge";
import { saveCollectedResult } from "@/lib/backend/aio/collector";
import { listAioKeywords } from "@/lib/backend/aio/store";
import { getBrandAioSettings, listBrandYoutubeChannels } from "@/lib/backend/brandAioConfig";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { sanitizeAioResult } from "@/lib/aioResultImport";

// YouTube AIO "지금 수집"의 반영 — 사용자 PC의 설치형 수집기가 Google에서 검색한 결과 한 건을 로그인한 브라우저가 올린다.
// 어떤 키워드·디바이스인지와 국가·언어는 서버가 가진 값으로 확인하고, 자사 영상 판정과 저장은 서버가 한다
// (채널 매칭에 YouTube 조회가 필요하고, 판정 기준을 화면이 정하게 두지 않는다). 수집기는 서버·DB에 직접 붙지 않는다.
export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  const keywordId = typeof body?.keywordId === "string" ? body.keywordId : "";
  const device = body?.device;
  if (device !== "mobile" && device !== "desktop") return NextResponse.json({ error: "디바이스가 올바르지 않습니다." }, { status: 400 });
  const brand = brandId ? await getManagedBrand(tenant.orgId, brandId) : null;
  if (!brand) return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  const keyword = (await listAioKeywords(brandId)).find((k) => k.id === keywordId);
  if (!keyword) return NextResponse.json({ error: "프롬프트를 찾을 수 없습니다." }, { status: 404 });

  const result = sanitizeAioResult(body?.result);
  if (!result) return NextResponse.json({ error: "수집 결과 형식이 올바르지 않습니다." }, { status: 400 });

  const channels = await listBrandYoutubeChannels(brandId);
  if (channels.length === 0) return NextResponse.json({ error: "YouTube 채널을 먼저 연동하세요." }, { status: 400 });
  const settings = await getBrandAioSettings(brandId);
  const { citations, saved } = await saveCollectedResult({
    brandId,
    keywordId,
    device,
    country: settings.country,
    language: settings.language,
    result,
    context: buildJudgeContext(brand, channels.map((c) => c.channelId)),
  });
  return NextResponse.json({
    saved: saved !== null,
    status: result.status,
    captcha: result.errorKind === "captcha",
    sources: citations.length,
    youtube: citations.filter((c) => c.sourceType === "own_video" || c.sourceType === "other_youtube").length,
    ownPositions: citations.filter((c) => c.sourceType === "own_video").map((c) => c.position),
    message: result.errorMessage ?? null,
  });
}
