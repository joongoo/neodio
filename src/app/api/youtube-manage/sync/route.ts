import { NextRequest, NextResponse } from "next/server";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";
import { listBrandYoutubeChannels } from "@/lib/backend/brandAioConfig";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { listChannelVideos, YoutubeApiKeyMissingError } from "@/lib/backend/youtube";
import { saveSyncedVideos } from "@/lib/backend/aio/videoManage";
import { YoutubeVideoMeta } from "@/lib/db/types";

// YouTube 관리의 "영상 가져오기" — 브랜드에 연결된 채널마다 공개 영상을 최신순으로 가져와 저장한다.
// 새 영상은 체크 해제 상태로 들어가고, 이미 있는 영상은 제목·게시일만 갱신한다(체크·보관 상태는 그대로).
export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const brandId = typeof body?.brandId === "string" ? body.brandId : "";
  if (!brandId || !(await getManagedBrand(tenant.orgId, brandId))) {
    return NextResponse.json({ error: "브랜드를 찾을 수 없습니다." }, { status: 404 });
  }
  const channels = await listBrandYoutubeChannels(brandId);
  if (channels.length === 0) return NextResponse.json({ error: "연결된 YouTube 채널이 없습니다." }, { status: 400 });

  const videos: YoutubeVideoMeta[] = [];
  try {
    for (const channel of channels) videos.push(...(await listChannelVideos(channel.channelId, channel.title)));
  } catch (error) {
    if (error instanceof YoutubeApiKeyMissingError) {
      return NextResponse.json({ error: "영상을 가져오려면 서버에 YouTube API 키(YOUTUBE_API_KEY)가 필요합니다." }, { status: 503 });
    }
    return NextResponse.json({ error: "YouTube에서 영상 목록을 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 502 });
  }
  const result = await saveSyncedVideos(brandId, videos);
  return NextResponse.json({ ...result, channels: channels.length });
}
