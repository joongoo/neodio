import type { RawCitationMetadata } from "./db/types";
import { parseYoutubeVideoUrl } from "./backend/youtube";

export interface GeminiObservation {
  id: string; promptId: string; query: string; runAt: string; status: string;
  webSearch: boolean | null; citations: RawCitationMetadata[];
}
export interface GeminiVideoMeta { videoId: string; channelId: string; title: string; channelTitle: string | null }
export type GeminiSourceType = "own" | "other" | "unknown" | "web";
export const GEMINI_SOURCE_LABELS: Record<GeminiSourceType, string> = {
  own: "우리 채널 영상", other: "타 채널 영상", unknown: "채널 미확인 영상", web: "기타 웹 출처",
};

export function geminiDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function geminiVideoId(url: string) {
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) return null;
    return parseYoutubeVideoUrl(url)?.videoId ?? null;
  } catch { return null; }
}

function latest(observations: GeminiObservation[]) {
  const map = new Map<string, GeminiObservation>();
  for (const o of observations) {
    const current = map.get(o.promptId);
    if (!current || Date.parse(o.runAt) > Date.parse(current.runAt) || (Date.parse(o.runAt) === Date.parse(current.runAt) && o.id > current.id)) map.set(o.promptId, o);
  }
  return [...map.values()];
}

export function buildGeminiOverview(observations: GeminiObservation[], videos: GeminiVideoMeta[], ownChannelIds: string[], dates: string[]) {
  const cache = new Map(videos.map(video => [video.videoId, video]));
  const own = new Set(ownChannelIds);
  function describe(o: GeminiObservation) {
    const seen = new Set<string>();
    const citations = o.citations.flatMap(c => {
      const videoId = geminiVideoId(c.url);
      // A timestamp/short URL for the same video is still a single source.
      const key = videoId ?? c.url;
      if (seen.has(key)) return [];
      seen.add(key);
      const meta = videoId ? cache.get(videoId) : null;
      const channelId = meta?.channelId || c.channelId || null;
      const type: GeminiSourceType = !videoId ? "web" : !channelId || own.size === 0 ? "unknown" : own.has(channelId) ? "own" : "other";
      return [{ title: meta?.title || c.title, url: c.url, videoId, channelId, channelTitle: meta?.channelTitle ?? null, type }];
    });
    const measurable = o.status === "success" && o.webSearch === true;
    return { ...o, citations, measurable, hasYoutube: citations.some(c => c.videoId !== null), hasOwn: citations.some(c => c.type === "own"),
      hasUnknown: citations.some(c => c.type === "unknown") };
  }
  const rows = latest(observations).map(describe).sort((a, b) => b.runAt.localeCompare(a.runAt) || b.id.localeCompare(a.id));
  function rates(items: ReturnType<typeof describe>[]) {
    const measured = items.filter(o => o.measurable);
    // Unknown videos may belong to us. Exclude uncertain negative answers
    // from the own-channel denominator, instead of treating them as zero.
    const classifiable = measured.filter(o => o.hasOwn || !o.hasUnknown);
    return { measured: measured.length, youtube: measured.filter(o => o.hasYoutube).length,
      own: classifiable.filter(o => o.hasOwn).length, classifiable: classifiable.length,
      youtubeRate: measured.length ? measured.filter(o => o.hasYoutube).length / measured.length : null,
      ownRate: classifiable.length && own.size > 0 ? classifiable.filter(o => o.hasOwn).length / classifiable.length : null };
  }
  const measured = rows.filter(o => o.measurable);
  const sourceCounts: Record<GeminiSourceType, number> = { own: 0, other: 0, unknown: 0, web: 0 };
  const citedVideos = new Map<string, { videoId: string; title: string; channelTitle: string | null; type: GeminiSourceType; prompts: number; lastAt: string; runId: string }>();
  for (const o of measured) for (const c of o.citations) {
    sourceCounts[c.type]++;
    if (!c.videoId) continue;
    const current = citedVideos.get(c.videoId);
    if (current) current.prompts++;
    else citedVideos.set(c.videoId, { videoId: c.videoId, title: c.title, channelTitle: c.channelTitle, type: c.type, prompts: 1, lastAt: o.runAt, runId: o.id });
  }
  return { rows, ...rates(rows), excluded: rows.length - measured.length,
    ownVideos: [...citedVideos.values()].filter(v => v.type === "own").length,
    unknownVideos: [...citedVideos.values()].filter(v => v.type === "unknown").length,
    sourceCounts, videos: [...citedVideos.values()].sort((a, b) => b.prompts - a.prompts || a.videoId.localeCompare(b.videoId)),
    trend: dates.map(day => ({ day, ...rates(latest(observations.filter(o => geminiDate(o.runAt) === day)).map(describe)) })) };
}

export type GeminiOverview = ReturnType<typeof buildGeminiOverview>;
