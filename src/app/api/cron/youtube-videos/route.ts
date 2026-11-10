import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { listChannelVideos } from "@/lib/backend/youtube";
import { saveSyncedVideos } from "@/lib/backend/aio/videoManage";

// 매일 09:00 KST에 연결된 채널의 최신 1페이지를 확인한다. 수동 가져오기는 전체 500개까지 조회한다.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured" }, { status: 503 });
  }

  const rows = await (await getPromptStore()).query<{ brand_id: string; channel_id: string; title: string }>(
    "SELECT brand_id,channel_id,title FROM brand_youtube_channels ORDER BY channel_id,brand_id"
  );
  const byChannel = new Map<string, { title: string; brandIds: string[] }>();
  for (const row of rows) {
    const entry = byChannel.get(row.channel_id) ?? { title: row.title, brandIds: [] };
    entry.brandIds.push(row.brand_id);
    byChannel.set(row.channel_id, entry);
  }

  let added = 0;
  const failures: string[] = [];
  for (const [channelId, channel] of byChannel) {
    try {
      const videos = await listChannelVideos(channelId, channel.title, 50, 1);
      for (const brandId of channel.brandIds) {
        const result = await saveSyncedVideos(brandId, videos);
        added += result.added;
      }
    } catch (error) {
      console.error("YouTube channel sync failed", channelId, error);
      failures.push(channelId);
    }
  }
  return NextResponse.json({ channels: byChannel.size, added, failed: failures.length }, { status: failures.length ? 502 : 200 });
}
