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
  YoutubeVideoMeta,
} from "@/lib/db/types";

// YouTube AIO 인용 트래커 저장소 — 키워드, 수집 결과(관측), 인용, 영상
// 메타 캐시, 영상 최적화 작업 이력. 전부 brand_id 단위.

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
  const rows = await (await store()).query<{ video_id: string; channel_id: string; title: string; thumbnail_url: string }>(
    "SELECT video_id,channel_id,title,thumbnail_url FROM youtube_videos WHERE video_id = ANY($1)",
    [[...new Set(videoIds)]]
  );
  return new Map(rows.map((row) => [row.video_id, { videoId: row.video_id, channelId: row.channel_id, title: row.title, thumbnailUrl: row.thumbnail_url }]));
}

export async function cacheVideo(video: YoutubeVideoMeta): Promise<void> {
  await (await store()).query(
    `INSERT INTO youtube_videos (video_id,channel_id,title,thumbnail_url,fetched_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (video_id) DO UPDATE SET channel_id=EXCLUDED.channel_id,title=EXCLUDED.title,thumbnail_url=EXCLUDED.thumbnail_url,fetched_at=EXCLUDED.fetched_at`,
    [video.videoId, video.channelId, video.title, video.thumbnailUrl, new Date().toISOString()]
  );
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
