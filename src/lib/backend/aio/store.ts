import { randomUUID } from "node:crypto";
import { getPromptStore } from "../database";
import {
  AioCitation,
  AioDevice,
  AioKeyword,
  AioKeywordGroup,
  AioObservation,
  AioObservationStatus,
  AioParagraph,
  AioSourceType,
  AioVideoWorkLog,
  BrandVideo,
  BrandVideoAddResult,
  VideoCitationSummary,
  VideoKeywordCitation,
  YoutubeVideoMeta,
} from "@/lib/db/types";

// YouTube AIO 인용 트래커 저장소 — 키워드, 수집 결과(관측), 인용, 영상
// 메타 캐시, 추적 영상, 영상 최적화 작업 이력. 전부 brand_id 단위.

export const AIO_KEYWORD_GROUPS: AioKeywordGroup[] = ["brand", "category", "comparison", "howto"];

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

/** 수집 시각 → Asia/Seoul 기준 날짜(yyyy-mm-dd). 하루 1건 기준이 한국 날짜라서. */
export function seoulDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

async function store() {
  return getPromptStore();
}

// ---- 키워드 ----

export async function listAioKeywords(brandId: string): Promise<AioKeyword[]> {
  const rows = await (await store()).query<{ id: string; keyword: string; keyword_group: AioKeywordGroup; created_at: string }>(
    "SELECT id,keyword,keyword_group,created_at FROM aio_keywords WHERE brand_id=$1 AND status='active' ORDER BY created_at,keyword",
    [brandId]
  );
  return rows.map((row) => ({ id: row.id, keyword: row.keyword, group: row.keyword_group, createdAt: row.created_at }));
}

/** 이미 있는 키워드는 그룹만 갱신하고 보관 상태면 다시 활성화한다. 추가/갱신된 개수를 돌려준다. */
export async function addAioKeywords(brandId: string, keywords: string[], group: AioKeywordGroup): Promise<number> {
  const s = await store();
  const unique = new Map<string, string>();
  for (const raw of keywords) {
    const keyword = raw.trim().replace(/\s+/g, " ");
    // 같은 입력 안의 중복은 처음 쓴 표기를 남긴다.
    if (keyword && !unique.has(normalizeKeyword(keyword))) unique.set(normalizeKeyword(keyword), keyword);
  }
  if (unique.size === 0) return 0;
  const now = new Date().toISOString();
  await s.transaction(async () => {
    for (const [normalized, keyword] of unique) {
      await s.query(
        `INSERT INTO aio_keywords (id,brand_id,keyword,normalized_keyword,keyword_group,status,created_at) VALUES ($1,$2,$3,$4,$5,'active',$6)
         ON CONFLICT (brand_id,normalized_keyword) DO UPDATE SET keyword_group=EXCLUDED.keyword_group,status='active'`,
        [`aiokw-${randomUUID()}`, brandId, keyword, normalized, group, now]
      );
    }
  });
  return unique.size;
}

// 보관(삭제 아님) — 지난 수집 결과와 추이는 남겨 둔다.
export async function archiveAioKeyword(brandId: string, keywordId: string): Promise<void> {
  await (await store()).query("UPDATE aio_keywords SET status='archived' WHERE brand_id=$1 AND id=$2", [brandId, keywordId]);
}

// ---- 영상 메타 캐시 ----

export async function getCachedVideos(videoIds: string[]): Promise<Map<string, YoutubeVideoMeta>> {
  if (videoIds.length === 0) return new Map();
  const rows = await (await store()).query<VideoRow>(
    "SELECT video_id,channel_id,channel_title,title,thumbnail_url FROM youtube_videos WHERE video_id = ANY($1)",
    [[...new Set(videoIds)]]
  );
  return new Map(rows.map((row) => [row.video_id, toVideoMeta(row)]));
}

type VideoRow = { video_id: string; channel_id: string; channel_title: string | null; title: string; thumbnail_url: string };

function toVideoMeta(row: VideoRow): YoutubeVideoMeta {
  return { videoId: row.video_id, channelId: row.channel_id, channelTitle: row.channel_title, title: row.title, thumbnailUrl: row.thumbnail_url };
}

// 채널 이름은 조회 방식에 따라 없을 수 있어(수집기 판정) 비어 있으면 기존 값을 남긴다.
export async function cacheVideo(video: YoutubeVideoMeta): Promise<void> {
  await (await store()).query(
    `INSERT INTO youtube_videos (video_id,channel_id,channel_title,title,thumbnail_url,fetched_at) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (video_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,channel_title=COALESCE(EXCLUDED.channel_title,youtube_videos.channel_title),
       title=EXCLUDED.title,thumbnail_url=EXCLUDED.thumbnail_url,fetched_at=EXCLUDED.fetched_at`,
    [video.videoId, video.channelId, video.channelTitle ?? null, video.title, video.thumbnailUrl, new Date().toISOString()]
  );
}

// ---- 추적 영상 (영상 단위 인용 추적, docs/youtube-video-tracking-plan.md §7) ----
// 화면 값은 전부 인용된 행(aio_citations)을 SQL에서 집계해 만든다 — 인용
// 행은 매일 늘어나므로 서버로 가져와 계산하지 않는다. 우리 채널 여부는
// 저장하지 않고 읽는 쪽에서 brand_youtube_channels와 대조한다.

export async function listBrandVideos(brandId: string): Promise<BrandVideo[]> {
  const rows = await (await store()).query<VideoRow & { added_at: string }>(
    `SELECT b.video_id,v.channel_id,v.channel_title,v.title,v.thumbnail_url,b.added_at FROM brand_videos b
     JOIN youtube_videos v ON v.video_id=b.video_id WHERE b.brand_id=$1 AND b.status='active' ORDER BY b.added_at DESC,b.video_id`,
    [brandId]
  );
  return rows.map((row) => ({ ...toVideoMeta(row), addedAt: row.added_at }));
}

/** 영상 메타를 캐시하고 추적 등록한다. 보관된 영상이면 다시 활성화한다. */
export async function addBrandVideo(brandId: string, video: YoutubeVideoMeta): Promise<BrandVideoAddResult> {
  const s = await store();
  return s.transaction(async () => {
    await cacheVideo(video);
    const [existing] = await s.query<{ status: string }>("SELECT status FROM brand_videos WHERE brand_id=$1 AND video_id=$2", [brandId, video.videoId]);
    if (existing?.status === "active") return "exists";
    await s.query(
      `INSERT INTO brand_videos (brand_id,video_id,status,added_at) VALUES ($1,$2,'active',$3)
       ON CONFLICT (brand_id,video_id) DO UPDATE SET status='active'`,
      [brandId, video.videoId, new Date().toISOString()]
    );
    return existing ? "reactivated" : "added";
  });
}

// 보관(삭제 아님) — 작업 이력은 남고 다시 등록하면 그대로 보인다.
export async function archiveBrandVideo(brandId: string, videoId: string): Promise<void> {
  await (await store()).query("UPDATE brand_videos SET status='archived' WHERE brand_id=$1 AND video_id=$2", [brandId, videoId]);
}

/**
 * 영상별 인용 요약(선택 디바이스). 최근 값(sinceDate 이후)은 활성 키워드만,
 * 첫·마지막 인용일은 보관 키워드까지 — 키워드를 보관해도 기준점이 움직이지 않게.
 * 인용 기록이 없는 영상은 결과에 없다.
 */
export async function videoCitationSummaries(
  brandId: string,
  videoIds: string[],
  device: AioDevice,
  sinceDate: string
): Promise<Map<string, VideoCitationSummary>> {
  if (videoIds.length === 0) return new Map();
  const rows = await (await store()).query<{
    video_id: string;
    recent_keywords: number;
    recent_best: number | null;
    first_date: string;
    last_date: string;
  }>(
    `SELECT c.video_id,
       count(DISTINCT o.keyword_id) FILTER (WHERE k.status='active' AND o.collected_date >= $4)::int AS recent_keywords,
       min(c.position) FILTER (WHERE k.status='active' AND o.collected_date >= $4) AS recent_best,
       min(o.collected_date) AS first_date, max(o.collected_date) AS last_date
     FROM aio_citations c JOIN aio_observations o ON o.id=c.observation_id JOIN aio_keywords k ON k.id=o.keyword_id
     WHERE o.brand_id=$1 AND o.device=$2 AND c.video_id = ANY($3)
     GROUP BY c.video_id`,
    [brandId, device, [...new Set(videoIds)], sinceDate]
  );
  return new Map(
    rows.map((row) => [
      row.video_id,
      { recentKeywords: row.recent_keywords, recentBestPosition: row.recent_best, firstCitedDate: row.first_date, lastCitedDate: row.last_date },
    ])
  );
}

const MAX_START_SECONDS = 3;

/** 영상 하나가 인용된 활성 키워드별 한 줄 — 최근 순위·인용 구간은 그 키워드의 마지막 인용일 값. */
export async function videoKeywordCitations(brandId: string, videoId: string, device: AioDevice): Promise<VideoKeywordCitation[]> {
  const rows = await (await store()).query<{
    keyword_id: string;
    keyword: string;
    keyword_group: AioKeywordGroup;
    last_date: string;
    cited_days: number;
    last_position: number;
    starts: number[];
  }>(
    `WITH cited AS (
       SELECT o.keyword_id, o.collected_date, c.position, c.start_seconds
       FROM aio_citations c JOIN aio_observations o ON o.id=c.observation_id
       WHERE o.brand_id=$1 AND o.device=$3 AND c.video_id=$2
     ), per_keyword AS (
       SELECT keyword_id, max(collected_date) AS last_date, count(DISTINCT collected_date)::int AS cited_days FROM cited GROUP BY keyword_id
     )
     SELECT p.keyword_id, k.keyword, k.keyword_group, p.last_date, p.cited_days, min(c.position)::int AS last_position,
       COALESCE(array_agg(DISTINCT c.start_seconds) FILTER (WHERE c.start_seconds IS NOT NULL), '{}') AS starts
     FROM per_keyword p
     JOIN aio_keywords k ON k.id=p.keyword_id AND k.status='active'
     JOIN cited c ON c.keyword_id=p.keyword_id AND c.collected_date=p.last_date
     GROUP BY p.keyword_id,k.keyword,k.keyword_group,p.last_date,p.cited_days
     ORDER BY p.last_date DESC, last_position, k.keyword`,
    [brandId, videoId, device]
  );
  return rows.map((row) => ({
    keywordId: row.keyword_id,
    keyword: row.keyword,
    group: row.keyword_group,
    lastCitedDate: row.last_date,
    lastPosition: row.last_position,
    startSeconds: [...row.starts].sort((a, b) => a - b).slice(0, MAX_START_SECONDS),
    citedDays: row.cited_days,
  }));
}

/** sinceDate 이후 이 디바이스로 성공한 수집이 있었는지 — 없으면 최근 값은 0이 아니라 "–". */
export async function hasMeasurementSince(brandId: string, device: AioDevice, sinceDate: string): Promise<boolean> {
  const rows = await (await store()).query(
    "SELECT 1 FROM aio_observations WHERE brand_id=$1 AND device=$2 AND collected_date >= $3 AND status<>'failed' LIMIT 1",
    [brandId, device, sinceDate]
  );
  return rows.length > 0;
}

// ---- 관측 ----

export interface AioObservationInput {
  keywordId: string;
  device: AioDevice;
  country: string;
  language: string;
  collectedAt: string;
  status: AioObservationStatus;
  aioText: string | null;
  paragraphs: AioParagraph[];
  citations: AioCitation[];
  screenshotPath: string | null;
  htmlPath: string | null;
  errorMessage: string | null;
}

/**
 * 같은 키워드·디바이스·날짜의 이전 수집분은 교체한다(하루 1건). 단, 실패한
 * 재수집이 그날의 성공 결과를 지우지는 않는다 — 저장하지 않고 null을 돌려준다.
 */
export async function saveAioObservation(brandId: string, input: AioObservationInput): Promise<string | null> {
  const s = await store();
  const id = `aioobs-${randomUUID()}`;
  const collectedDate = seoulDate(input.collectedAt);
  const own = input.citations.filter((c) => c.sourceType === "own_video");
  const hasYoutube = input.citations.some((c) => c.sourceType === "own_video" || c.sourceType === "other_youtube");
  let saved = true;
  await s.transaction(async () => {
    const existing = await s.query<{ status: AioObservationStatus }>(
      "SELECT status FROM aio_observations WHERE keyword_id=$1 AND device=$2 AND collected_date=$3",
      [input.keywordId, input.device, collectedDate]
    );
    if (input.status === "failed" && existing.some((row) => row.status !== "failed")) {
      saved = false;
      return;
    }
    await s.query("DELETE FROM aio_observations WHERE keyword_id=$1 AND device=$2 AND collected_date=$3", [input.keywordId, input.device, collectedDate]);
    await s.query(
      `INSERT INTO aio_observations (id,brand_id,keyword_id,device,country,language,collected_at,collected_date,status,
         aio_text,paragraphs_json,screenshot_path,html_path,error_message,has_youtube,has_own_video,own_best_position,source_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        id,
        brandId,
        input.keywordId,
        input.device,
        input.country,
        input.language,
        input.collectedAt,
        collectedDate,
        input.status,
        input.aioText,
        JSON.stringify(input.paragraphs),
        input.screenshotPath,
        input.htmlPath,
        input.errorMessage,
        hasYoutube,
        own.length > 0,
        own.length > 0 ? Math.min(...own.map((c) => c.position)) : null,
        input.citations.length,
      ]
    );
    for (const c of input.citations) {
      await s.query(
        "INSERT INTO aio_citations (observation_id,position,url,domain,title,source_type,video_id,channel_id,start_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id, c.position, c.url, c.domain, c.title, c.sourceType, c.videoId, c.channelId, c.startSeconds]
      );
    }
  });
  return saved ? id : null;
}

type ObservationRow = {
  id: string;
  keyword_id: string;
  device: AioDevice;
  collected_at: string;
  collected_date: string;
  status: AioObservationStatus;
  aio_text: string | null;
  paragraphs_json: AioParagraph[];
  screenshot_path: string | null;
  error_message: string | null;
};

type CitationRow = {
  observation_id: string;
  position: number;
  url: string;
  domain: string;
  title: string;
  source_type: AioSourceType;
  video_id: string | null;
  channel_id: string | null;
  start_seconds: number | null;
};

/** 기간 내 관측 전체(인용 포함). fromDate/toDate는 yyyy-mm-dd, 양끝 포함. */
export async function listAioObservations(
  brandId: string,
  { fromDate, toDate, keywordId }: { fromDate: string; toDate: string; keywordId?: string }
): Promise<AioObservation[]> {
  const s = await store();
  const rows = await s.query<ObservationRow>(
    `SELECT id,keyword_id,device,collected_at,collected_date,status,aio_text,paragraphs_json,screenshot_path,error_message
     FROM aio_observations WHERE brand_id=$1 AND collected_date BETWEEN $2 AND $3 AND ($4::text IS NULL OR keyword_id=$4)
     ORDER BY collected_date,collected_at`,
    [brandId, fromDate, toDate, keywordId ?? null]
  );
  if (rows.length === 0) return [];
  const citationRows = await s.query<CitationRow>(
    "SELECT * FROM aio_citations WHERE observation_id = ANY($1) ORDER BY observation_id,position",
    [rows.map((row) => row.id)]
  );
  const byObservation = new Map<string, AioCitation[]>();
  for (const c of citationRows) {
    const list = byObservation.get(c.observation_id) ?? [];
    list.push({
      position: c.position,
      url: c.url,
      domain: c.domain,
      title: c.title,
      sourceType: c.source_type,
      videoId: c.video_id,
      channelId: c.channel_id,
      startSeconds: c.start_seconds,
    });
    byObservation.set(c.observation_id, list);
  }
  return rows.map((row) => ({
    id: row.id,
    keywordId: row.keyword_id,
    device: row.device,
    collectedAt: row.collected_at,
    collectedDate: row.collected_date,
    status: row.status,
    aioText: row.aio_text,
    paragraphs: row.paragraphs_json,
    citations: byObservation.get(row.id) ?? [],
    hasScreenshot: !!row.screenshot_path,
    errorMessage: row.error_message,
  }));
}

export async function getAioScreenshotPath(brandId: string, observationId: string): Promise<string | null> {
  const [row] = await (await store()).query<{ screenshot_path: string | null }>(
    "SELECT screenshot_path FROM aio_observations WHERE brand_id=$1 AND id=$2",
    [brandId, observationId]
  );
  return row?.screenshot_path ?? null;
}

/** 오늘 이미 수집한 키워드×디바이스 — 재실행 시 건너뛰기용. */
export async function collectedToday(brandId: string, date: string): Promise<Set<string>> {
  const rows = await (await store()).query<{ keyword_id: string; device: string }>(
    "SELECT keyword_id,device FROM aio_observations WHERE brand_id=$1 AND collected_date=$2 AND status<>'failed'",
    [brandId, date]
  );
  return new Set(rows.map((row) => `${row.keyword_id}:${row.device}`));
}

/** 우리 영상별 첫 인용일 — "최적화 작업 이력"의 "AIO 첫 인용 발생". */
export async function firstOwnCitationDates(brandId: string, videoIds: string[]): Promise<Map<string, string>> {
  if (videoIds.length === 0) return new Map();
  const rows = await (await store()).query<{ video_id: string; first_date: string }>(
    `SELECT c.video_id, MIN(o.collected_date) AS first_date FROM aio_citations c
     JOIN aio_observations o ON o.id=c.observation_id
     WHERE o.brand_id=$1 AND c.source_type='own_video' AND c.video_id = ANY($2) GROUP BY c.video_id`,
    [brandId, videoIds]
  );
  return new Map(rows.map((row) => [row.video_id, row.first_date]));
}

// ---- 영상 최적화 작업 이력 ----

export async function listWorkLogs(brandId: string, videoIds: string[]): Promise<AioVideoWorkLog[]> {
  if (videoIds.length === 0) return [];
  const rows = await (await store()).query<{ id: string; video_id: string; work_date: string; work_type: string; note: string | null }>(
    "SELECT id,video_id,work_date,work_type,note FROM aio_video_work_logs WHERE brand_id=$1 AND video_id = ANY($2) ORDER BY work_date,created_at",
    [brandId, videoIds]
  );
  return rows.map((row) => ({ id: row.id, videoId: row.video_id, workDate: row.work_date, workType: row.work_type, note: row.note }));
}

export async function addWorkLog(brandId: string, log: Omit<AioVideoWorkLog, "id">): Promise<void> {
  await (await store()).query("INSERT INTO aio_video_work_logs (id,brand_id,video_id,work_date,work_type,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    `aiowork-${randomUUID()}`,
    brandId,
    log.videoId,
    log.workDate,
    log.workType,
    log.note,
    new Date().toISOString(),
  ]);
}

export async function deleteWorkLog(brandId: string, id: string): Promise<void> {
  await (await store()).query("DELETE FROM aio_video_work_logs WHERE brand_id=$1 AND id=$2", [brandId, id]);
}

// ---- 채널별 인용 요약 (브랜드 설정 > 소셜 계정) ----

export interface ChannelCitationStats {
  keywords: number;
  videos: number;
  lastCitedDate: string | null;
}

/** 최근 N일 동안 채널 영상이 AIO에 인용된 키워드·영상 수와 마지막 인용일. 수집 기록이 아예 없으면 null. */
export async function channelCitationStats(brandId: string, channelIds: string[], sinceDate: string): Promise<Map<string, ChannelCitationStats> | null> {
  const s = await store();
  const [{ n }] = await s.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM aio_observations WHERE brand_id=$1 AND collected_date >= $2 AND status<>'failed'",
    [brandId, sinceDate]
  );
  if (n === 0) return null;
  const rows = await s.query<{ channel_id: string; keywords: number; videos: number; last_date: string }>(
    `SELECT c.channel_id, count(DISTINCT o.keyword_id)::int AS keywords, count(DISTINCT c.video_id)::int AS videos, MAX(o.collected_date) AS last_date
     FROM aio_citations c JOIN aio_observations o ON o.id=c.observation_id
     WHERE o.brand_id=$1 AND o.collected_date >= $2 AND c.source_type='own_video' AND c.channel_id = ANY($3)
     GROUP BY c.channel_id`,
    [brandId, sinceDate, channelIds]
  );
  const stats = new Map<string, ChannelCitationStats>(channelIds.map((id) => [id, { keywords: 0, videos: 0, lastCitedDate: null }]));
  for (const row of rows) stats.set(row.channel_id, { keywords: row.keywords, videos: row.videos, lastCitedDate: row.last_date });
  return stats;
}
