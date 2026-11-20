import type { RawCitationMetadata } from "./db/types";
import { parseYoutubeVideoUrl } from "./backend/youtube";
import type { CitationDevice } from "./citationDevices";

export interface CitationObservation {
  id: string; promptId: string; query: string; runAt: string; status: string;
  webSearch: boolean | null; citations: RawCitationMetadata[];
  answerPresent?: boolean | null;
  latestAttemptFailed?: boolean;
  device?: CitationDevice | null;
}
export interface CitationVideoMeta { videoId: string; channelId: string; title: string; channelTitle: string | null }
export type CitationSourceType = "own" | "other" | "unknown" | "own_web" | "competitor" | "web";
export const CITATION_SOURCE_LABELS: Record<CitationSourceType, string> = {
  own: "우리 채널 영상", other: "타 채널 영상", unknown: "채널 미확인 영상", own_web: "자사 웹페이지", competitor: "경쟁사 사이트", web: "기타 웹 출처",
};

export function citationDate(value: string) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function citationVideoId(url: string) {
  try {
    if (!["http:", "https:"].includes(new URL(url).protocol)) return null;
    return parseYoutubeVideoUrl(url)?.videoId ?? null;
  } catch { return null; }
}

function latest(observations: CitationObservation[]) {
  const map = new Map<string, CitationObservation>();
  const attempts = new Map<string, CitationObservation>();
  for (const o of observations) {
    const attempt = attempts.get(o.promptId);
    if (!attempt || o.runAt > attempt.runAt || (o.runAt === attempt.runAt && o.id > attempt.id)) attempts.set(o.promptId, o);
    const current = map.get(o.promptId);
    if (current?.status === "success" && o.status !== "success") continue;
    if (!current || (o.status === "success" && current.status !== "success") || Date.parse(o.runAt) > Date.parse(current.runAt) || (Date.parse(o.runAt) === Date.parse(current.runAt) && o.id > current.id)) map.set(o.promptId, o);
  }
  return [...map.values()].map(o => ({ ...o, latestAttemptFailed: attempts.get(o.promptId)?.status === "failed" }));
}

export function buildCitationOverview(observations: CitationObservation[], videos: CitationVideoMeta[], ownChannelIds: string[], dates: string[], tracked: { id: string; query: string }[] = [], classifyWeb?: (url: string) => "own_web" | "competitor" | "web") {
  const cache = new Map(videos.map(video => [video.videoId, video]));
  const own = new Set(ownChannelIds);
  function describe(o: CitationObservation) {
    const seen = new Set<string>();
    const citations = o.citations.flatMap(c => {
      const videoId = citationVideoId(c.url);
      // A timestamp/short URL for the same video is still a single source.
      const key = videoId ?? c.url;
      if (seen.has(key)) return [];
      seen.add(key);
      const meta = videoId ? cache.get(videoId) : null;
      const channelId = meta?.channelId || c.channelId || null;
      const type: CitationSourceType = !videoId ? classifyWeb?.(c.url) ?? "web" : !channelId || own.size === 0 ? "unknown" : own.has(channelId) ? "own" : "other";
      return [{ title: meta?.title || c.title, url: c.url, videoId, channelId, channelTitle: meta?.channelTitle ?? null, type }];
    });
    const measurable = o.status === "success" && o.webSearch === true && o.answerPresent !== false && o.answerPresent !== null;
    return { ...o, citations, measurable, hasYoutube: citations.some(c => c.videoId !== null), hasOwn: citations.some(c => c.type === "own"),
      hasUnknown: citations.some(c => c.type === "unknown") };
  }
  const snapshots = latest(observations);
  const collected = new Set(snapshots.map(o => o.promptId));
  const rows = [...snapshots, ...tracked.filter(p => !collected.has(p.id)).map(p => ({ id: "", promptId: p.id, query: p.query, runAt: "", status: "uncollected", webSearch: null, citations: [] }))].map(describe).sort((a, b) => b.runAt.localeCompare(a.runAt) || b.id.localeCompare(a.id));
  function rates(items: ReturnType<typeof describe>[]) {
    const measured = items.filter(o => o.measurable);
    const exposureMeasured = items.filter(o => o.status === "success" && (o.answerPresent === true || o.answerPresent === false));
    const exposurePresent = exposureMeasured.filter(o => o.answerPresent === true).length;
    // Unknown videos may belong to us. Exclude uncertain negative answers
    // from the own-channel denominator, instead of treating them as zero.
    const classifiable = measured.filter(o => o.hasOwn || !o.hasUnknown);
    return { measured: measured.length, youtube: measured.filter(o => o.hasYoutube).length,
      exposureMeasured: exposureMeasured.length, exposurePresent,
      exposureRate: exposureMeasured.length ? exposurePresent / exposureMeasured.length : null,
      own: classifiable.filter(o => o.hasOwn).length, classifiable: classifiable.length,
      youtubeRate: measured.length ? measured.filter(o => o.hasYoutube).length / measured.length : null,
      ownRate: classifiable.length && own.size > 0 ? classifiable.filter(o => o.hasOwn).length / classifiable.length : null };
  }
  const measured = rows.filter(o => o.measurable);
  const sourceCounts: Record<CitationSourceType, number> = { own: 0, other: 0, unknown: 0, own_web: 0, competitor: 0, web: 0 };
  const citedVideos = new Map<string, { videoId: string; title: string; channelTitle: string | null; type: CitationSourceType; prompts: number; lastAt: string; runId: string }>();
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
    trend: dates.map(day => ({ day, ...rates(latest(observations.filter(o => citationDate(o.runAt) === day)).map(describe)) })) };
}

export type CitationOverview = ReturnType<typeof buildCitationOverview>;
