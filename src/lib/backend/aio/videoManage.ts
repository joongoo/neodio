import { getPromptStore } from "../database";
import { cacheVideo, listBrandVideos } from "./store";
import { normalizeSurfaces } from "@/lib/promptSurfaces";
import { AioDevice, ManagedVideo, VideoPromptRow, YoutubeVideoMeta } from "@/lib/db/types";

// YouTube 관리 — 채널에서 가져온 영상 목록, 체크(예상 프롬프트를 만들 영상), 영상별 예상 프롬프트.
// 영상 ↔ 프롬프트 연결은 prompt_sources(source_type='youtube-video', source_key=영상 ID)로 남긴다 —
// 프롬프트를 라이브러리에 등록할 때 함께 기록되므로 별도 테이블이 없다.

export const VIDEO_SOURCE_TYPE = "youtube-video";

/**
 * 채널에서 가져온 영상을 메타 캐시와 브랜드 영상 목록에 넣는다. 새 영상은 체크 해제 상태로 들어가고,
 * 이미 있는 영상(체크·보관 상태 포함)은 제목·게시일 같은 메타만 갱신한다.
 */
export async function saveSyncedVideos(brandId: string, videos: YoutubeVideoMeta[]): Promise<{ added: number; total: number }> {
  const s = await getPromptStore();
  return s.transaction(async () => {
    let added = 0;
    for (const video of videos) {
      await cacheVideo(video);
      const inserted = await s.query(
        `INSERT INTO brand_videos (brand_id,video_id,status,added_at,checked) VALUES ($1,$2,'active',$3,false)
         ON CONFLICT (brand_id,video_id) DO NOTHING RETURNING video_id`,
        [brandId, video.videoId, new Date().toISOString()]
      );
      if (inserted.length > 0) added += 1;
    }
    return { added, total: videos.length };
  });
}

/** 활성 영상 전체 + 영상마다 이 영상용으로 만든 활성 프롬프트 수. 최신 게시 영상이 먼저. */
export async function listManagedVideos(brandId: string): Promise<ManagedVideo[]> {
  const s = await getPromptStore();
  const [videos, counts] = await Promise.all([
    listBrandVideos(brandId),
    s.query<{ video_id: string; n: number }>(
      `SELECT ps.source_key AS video_id, count(DISTINCT tr.prompt_id)::int AS n
       FROM prompt_sources ps JOIN prompt_tracking tr ON tr.prompt_id=ps.prompt_id AND tr.brand_id=$1 AND tr.status='active'
       WHERE ps.source_type=$2 GROUP BY ps.source_key`,
      [brandId, VIDEO_SOURCE_TYPE]
    ),
  ]);
  const countOf = new Map(counts.map((row) => [row.video_id, row.n]));
  return videos
    .map((video) => ({ ...video, promptCount: countOf.get(video.videoId) ?? 0 }))
    .sort((a, b) => (b.publishedAt ?? b.addedAt).localeCompare(a.publishedAt ?? a.addedAt) || a.videoId.localeCompare(b.videoId));
}

/** 체크를 켜거나 끈다. 이 브랜드의 활성 영상만 바뀌고, 바뀐 개수를 돌려준다. */
export async function setVideosChecked(brandId: string, videoIds: string[], checked: boolean): Promise<number> {
  if (videoIds.length === 0) return 0;
  const rows = await (await getPromptStore()).query(
    "UPDATE brand_videos SET checked=$3 WHERE brand_id=$1 AND status='active' AND video_id = ANY($2) AND checked<>$3 RETURNING video_id",
    [brandId, [...new Set(videoIds)], checked]
  );
  return rows.length;
}

/** 이 브랜드의 활성 영상인지 — 프롬프트를 아무 영상 ID에나 붙이지 못하게 막는다. */
export async function activeVideoIds(brandId: string, videoIds: string[]): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const rows = await (await getPromptStore()).query<{ video_id: string }>(
    "SELECT video_id FROM brand_videos WHERE brand_id=$1 AND status='active' AND video_id = ANY($2)",
    [brandId, [...new Set(videoIds)]]
  );
  return new Set(rows.map((row) => row.video_id));
}

/** 영상 하나용으로 만든 활성 프롬프트와, 그 프롬프트의 Google AIO 수집·인용 결과(선택 디바이스). */
export async function videoPromptRows(brandId: string, videoId: string, device: AioDevice): Promise<VideoPromptRow[]> {
  const rows = await (await getPromptStore()).query<{
    prompt_id: string;
    text: string;
    surfaces: string[];
    keyword_id: string | null;
    measured: boolean;
    last_date: string | null;
    last_position: number | null;
  }>(
    `SELECT p.id AS prompt_id, p.text,
       (SELECT coalesce(array_agg(s.surface),'{}') FROM prompt_tracking_surfaces s WHERE s.tracking_id=tr.id) AS surfaces,
       k.id AS keyword_id,
       CASE WHEN k.id IS NULL THEN false ELSE EXISTS(
         SELECT 1 FROM aio_observations o WHERE o.keyword_id=k.id AND o.device=$3 AND o.status<>'failed') END AS measured,
       (SELECT max(o.collected_date) FROM aio_citations c JOIN aio_observations o ON o.id=c.observation_id
         WHERE o.keyword_id=k.id AND o.device=$3 AND c.video_id=$2) AS last_date,
       (SELECT c.position FROM aio_citations c JOIN aio_observations o ON o.id=c.observation_id
         WHERE o.keyword_id=k.id AND o.device=$3 AND c.video_id=$2 ORDER BY o.collected_date DESC, c.position LIMIT 1)::int AS last_position
     FROM prompt_sources ps
     JOIN prompts p ON p.id=ps.prompt_id
     JOIN prompt_tracking tr ON tr.prompt_id=p.id AND tr.brand_id=$1 AND tr.status='active'
     LEFT JOIN aio_keywords k ON k.prompt_id=p.id AND k.brand_id=$1 AND k.status='active'
     WHERE ps.source_type=$4 AND ps.source_key=$2
     ORDER BY tr.added_at, p.text`,
    [brandId, videoId, device, VIDEO_SOURCE_TYPE]
  );
  return rows.map((row) => ({
    promptId: row.prompt_id,
    text: row.text,
    surfaces: normalizeSurfaces(row.surfaces),
    aioTracked: row.keyword_id !== null,
    aioMeasured: row.measured,
    lastCitedDate: row.last_date,
    lastPosition: row.last_position,
  }));
}
