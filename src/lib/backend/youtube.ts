import type { YoutubeVideoMeta } from "@/lib/db/types";

// YouTube 채널/영상 식별 — AIO 인용 판정의 기준은 도메인(youtube.com)이
// 아니라 "채널 ID"다(docs/youtube-aio-tracker-plan.md §1). 인용 링크에서
// 영상 ID를 뽑고, 영상 → 채널 ID를 조회해 브랜드에 등록된 채널과 대조한다.
//
// YOUTUBE_API_KEY가 있으면 공식 Data API(v3)를 쓰고, 없으면 공개 페이지
// HTML(채널 canonical 링크, 영상 videoDetails)에서 읽는다 — 키 발급 전에도
// 브랜드 관리에서 채널 등록이 되도록.

export interface YoutubeChannelInfo {
  channelId: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
}

export interface YoutubeVideoInfo {
  videoId: string;
  channelId: string;
  title: string;
  thumbnailUrl: string;
}

export interface ParsedYoutubeUrl {
  videoId: string;
  /** 인용 구간 시작(초) — 링크에 t=/start= 가 있을 때만. */
  startSeconds: number | null;
}

const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const HANDLE_PATTERN = /^@[\w.\-가-힣]{3,}$/;

const PAGE_HEADERS = {
  "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

function isYoutubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  return host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com";
}

// "90", "90s", "1m30s", "1h2m3s" → 초
export function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

/** 인용 URL이 YouTube 영상이면 영상 ID와 타임스탬프를, 아니면 null. */
export function parseYoutubeVideoUrl(raw: string): ParsedYoutubeUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!isYoutubeHost(url.hostname)) return null;

  let videoId: string | null = null;
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    videoId = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    videoId = match?.[1] ?? null;
  }
  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;

  // t=는 쿼리 또는 해시(#t=)로 올 수 있다.
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const t = url.searchParams.get("t") ?? url.searchParams.get("start") ?? hashParams.get("t");
  return { videoId, startSeconds: parseTimestamp(t) };
}

export type ChannelInput = { kind: "id"; channelId: string } | { kind: "handle"; handle: string };

/** 브랜드 관리에서 입력받은 값(채널 URL, @핸들, UC… ID)을 정규화. */
export function parseChannelInput(raw: string): ChannelInput | null {
  const value = raw.trim();
  if (CHANNEL_ID_PATTERN.test(value)) return { kind: "id", channelId: value };
  if (HANDLE_PATTERN.test(value)) return { kind: "handle", handle: value };

  let url: URL;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!isYoutubeHost(url.hostname)) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first === "channel" && second && CHANNEL_ID_PATTERN.test(second)) return { kind: "id", channelId: second };
  if (first?.startsWith("@")) return { kind: "handle", handle: decodeURIComponent(first) };
  return null;
}

function metaContent(html: string, property: string): string | null {
  const match = html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`));
  return match ? decodeHtml(match[1]) : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: PAGE_HEADERS, cache: "no-store" });
  if (!response.ok) throw new Error(`YouTube 요청 실패 (${response.status})`);
  return response.text();
}

async function apiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_API_KEY;
  const query = new URLSearchParams({ ...params, key: key ?? "" });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`YouTube Data API 요청 실패 (${response.status})`);
  return response.json() as Promise<T>;
}

type ApiChannelList = {
  items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: Record<string, { url: string }> } }[];
};

export async function resolveYoutubeChannel(raw: string): Promise<YoutubeChannelInfo | null> {
  const input = parseChannelInput(raw);
  if (!input) return null;

  if (process.env.YOUTUBE_API_KEY) {
    const data = await apiGet<ApiChannelList>("channels", {
      part: "snippet",
      ...(input.kind === "id" ? { id: input.channelId } : { forHandle: input.handle }),
    });
    const item = data.items?.[0];
    if (!item) return null;
    return {
      channelId: item.id,
      handle: item.snippet.customUrl ?? (input.kind === "handle" ? input.handle : null),
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    };
  }

  const pageUrl =
    input.kind === "id"
      ? `https://www.youtube.com/channel/${input.channelId}`
      : `https://www.youtube.com/${encodeURIComponent(input.handle)}`;
  let html: string;
  try {
    html = await fetchText(pageUrl);
  } catch {
    return null;
  }
  const canonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1];
  const title = metaContent(html, "og:title");
  if (!canonical || !title) return null;
  const vanity = html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/)?.[1];
  return {
    channelId: canonical,
    handle: input.kind === "handle" ? input.handle : vanity ? decodeURIComponent(vanity) : null,
    title,
    thumbnailUrl: metaContent(html, "og:image"),
  };
}

type ApiVideoList = {
  items?: { id: string; snippet: { channelId: string; title: string; thumbnails?: Record<string, { url: string }> } }[];
};

export async function resolveYoutubeVideo(videoId: string): Promise<YoutubeVideoInfo | null> {
  if (!VIDEO_ID_PATTERN.test(videoId)) return null;
  const fallbackThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (process.env.YOUTUBE_API_KEY) {
    const data = await apiGet<ApiVideoList>("videos", { part: "snippet", id: videoId });
    const item = data.items?.[0];
    if (!item) return null;
    return {
      videoId,
      channelId: item.snippet.channelId,
      title: item.snippet.title,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? fallbackThumb,
    };
  }

  let html: string;
  try {
    html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`);
  } catch {
    return null;
  }
  // videoDetails 블록 안의 channelId만 신뢰한다 — 페이지 곳곳(추천 영상 등)에
  // 다른 채널의 "channelId"도 섞여 있다.
  const details = html.match(/"videoDetails":\{"videoId":"[\w-]{11}".*?"channelId":"(UC[\w-]{22})"/);
  const channelId = details?.[1] ?? html.match(/<meta itemprop="channelId" content="(UC[\w-]{22})"/)?.[1];
  if (!channelId) return null;
  return {
    videoId,
    channelId,
    title: metaContent(html, "og:title") ?? metaContent(html, "title") ?? videoId,
    thumbnailUrl: fallbackThumb,
  };
}

// ---- 채널 영상 목록 (YouTube 관리의 "영상 가져오기") ----
// 채널의 업로드 재생목록(UC… → UU…)을 50개씩 넘겨 읽는다. playlistItems.list는 호출당 1유닛이라
// 영상 500개도 10유닛이면 끝난다(하루 무료 10,000유닛). 공개 페이지 HTML로는 전체 목록을 안정적으로 못 읽으므로 API 키가 필요하다.

export class YoutubeApiKeyMissingError extends Error {
  constructor() {
    super("채널 영상을 가져오려면 YOUTUBE_API_KEY가 필요합니다.");
  }
}

export const CHANNEL_VIDEO_LIMIT = 500;
const DESCRIPTION_LIMIT = 1500;

type ApiPlaylistItems = {
  nextPageToken?: string;
  items?: {
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      videoOwnerChannelId?: string;
      videoOwnerChannelTitle?: string;
      thumbnails?: Record<string, { url: string }>;
      resourceId?: { videoId?: string };
    };
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
  }[];
};

/** 업로드 재생목록 한 페이지 → 영상 메타. 삭제·비공개 영상은 건너뛴다. (순수 함수 — 테스트 대상) */
export function parsePlaylistPage(data: ApiPlaylistItems, channelId: string, channelTitle: string | null): YoutubeVideoMeta[] {
  const videos: YoutubeVideoMeta[] = [];
  for (const item of data.items ?? []) {
    const snippet = item.snippet;
    const videoId = item.contentDetails?.videoId ?? snippet?.resourceId?.videoId;
    if (!snippet || !videoId || !VIDEO_ID_PATTERN.test(videoId)) continue;
    // 삭제·비공개 영상은 제목이 고정 문구이고 썸네일이 없다.
    if (snippet.title === "Deleted video" || snippet.title === "Private video" || !snippet.thumbnails) continue;
    videos.push({
      videoId,
      channelId: snippet.videoOwnerChannelId ?? channelId,
      channelTitle: snippet.videoOwnerChannelTitle ?? channelTitle,
      title: snippet.title ?? videoId,
      thumbnailUrl: snippet.thumbnails.medium?.url ?? snippet.thumbnails.default?.url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: item.contentDetails?.videoPublishedAt ?? snippet.publishedAt ?? null,
      description: snippet.description ? snippet.description.slice(0, DESCRIPTION_LIMIT) : null,
    });
  }
  return videos;
}

/** 채널의 공개 영상을 최신순으로 가져온다(최대 CHANNEL_VIDEO_LIMIT). 키가 없으면 YoutubeApiKeyMissingError. */
export async function listChannelVideos(channelId: string, channelTitle: string | null, limit = CHANNEL_VIDEO_LIMIT): Promise<YoutubeVideoMeta[]> {
  if (!process.env.YOUTUBE_API_KEY) throw new YoutubeApiKeyMissingError();
  if (!CHANNEL_ID_PATTERN.test(channelId)) return [];
  const uploads = `UU${channelId.slice(2)}`;
  const videos: YoutubeVideoMeta[] = [];
  let pageToken: string | undefined;
  while (videos.length < limit) {
    const data = await apiGet<ApiPlaylistItems>("playlistItems", {
      part: "snippet,contentDetails",
      playlistId: uploads,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    videos.push(...parsePlaylistPage(data, channelId, channelTitle));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return videos.slice(0, limit);
}
