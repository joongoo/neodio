import { resolveYoutubeVideo } from "../youtube";
import { cacheVideo, getCachedVideos } from "./store";
import type { AioCitation, RawCitationMetadata, YoutubeVideoMeta } from "@/lib/db/types";

// Shared by the local collector and SERP projection: cached metadata first.
export async function lookupAioVideo(videoId: string): Promise<YoutubeVideoMeta | null> {
  const cached = (await getCachedVideos([videoId])).get(videoId);
  if (cached) return cached;
  const fetched = await resolveYoutubeVideo(videoId).catch(() => null);
  if (fetched) await cacheVideo(fetched);
  return fetched;
}

export function toRawAioCitation(citation: AioCitation): RawCitationMetadata {
  return {
    title: citation.title, url: citation.url, domain: citation.domain,
    isOwnDomain: citation.sourceType === "own_video" || citation.sourceType === "own_web",
    position: citation.position, sourceType: citation.sourceType,
    videoId: citation.videoId, channelId: citation.channelId, startSeconds: citation.startSeconds,
  };
}
