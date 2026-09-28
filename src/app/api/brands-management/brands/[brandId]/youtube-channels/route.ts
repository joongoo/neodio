import { NextRequest, NextResponse } from "next/server";
import { addBrandYoutubeChannel, listBrandYoutubeChannels, removeBrandYoutubeChannel } from "@/lib/backend/brandAioConfig";
import { getManagedBrand, getManagedBrandById, updateManagedBrand } from "@/lib/backend/brandsManagementStore";
import { parseChannelInput, resolveYoutubeChannel } from "@/lib/backend/youtube";
import { findChannelForSocial, socialForChannel } from "@/lib/youtubeSocial";
import { getCurrentTenant } from "@/lib/backend/tenant";

// YouTube AIO 인용 판정용 채널 — 채널 URL/@핸들/UC… ID를 받아 실제 채널
// ID로 조회한 뒤 저장한다. 연결 관리의 "YouTube 채널" 카드와 브랜드 설정의
// "소셜 계정"이 둘 다 이 API를 쓰고, 여기서 소셜 계정 목록도 같이 맞춰
// 두 화면이 어긋나지 않게 한다. 응답에 두 목록을 모두 돌려준다.
async function respond(brandId: string) {
  const [channels, brand] = await Promise.all([listBrandYoutubeChannels(brandId), getManagedBrandById(brandId)]);
  return NextResponse.json({ channels, socialAccounts: brand?.socialAccounts ?? [] });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const tenant = await getCurrentTenant();
  const { brandId } = await params;
  const brand = await getManagedBrand(tenant.orgId, brandId);
  if (!brand) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input : "";
  if (!parseChannelInput(input)) {
    return NextResponse.json({ error: "채널 URL, @핸들 또는 채널 ID(UC…)를 입력하세요." }, { status: 400 });
  }

  const channel = await resolveYoutubeChannel(input).catch(() => null);
  if (!channel) {
    return NextResponse.json({ error: "채널을 찾을 수 없습니다. 주소를 다시 확인하세요." }, { status: 404 });
  }
  await addBrandYoutubeChannel(brandId, channel);

  const [saved] = (await listBrandYoutubeChannels(brandId)).filter((c) => c.channelId === channel.channelId);
  if (saved && !brand.socialAccounts.some((s) => findChannelForSocial(s, [saved]))) {
    await updateManagedBrand(brandId, { socialAccounts: [...brand.socialAccounts, socialForChannel(saved)] });
  }
  return respond(brandId);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const tenant = await getCurrentTenant();
  const { brandId } = await params;
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId가 필요합니다." }, { status: 400 });

  const channel = (await listBrandYoutubeChannels(brandId)).find((c) => c.channelId === channelId);
  await removeBrandYoutubeChannel(brandId, channelId);
  const brand = await getManagedBrand(tenant.orgId, brandId);
  if (brand && channel) {
    const remaining = brand.socialAccounts.filter((s) => !findChannelForSocial(s, [channel]));
    if (remaining.length !== brand.socialAccounts.length) await updateManagedBrand(brandId, { socialAccounts: remaining });
  }
  return respond(brandId);
}
