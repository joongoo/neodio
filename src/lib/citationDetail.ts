import { buildCitationOverview, citationDate, citationVideoId, type CitationObservation, type CitationVideoMeta } from "./citationMetrics";

export type CitationHistoryState = "own" | "youtube" | "none" | "absent" | "unknown" | "searchless" | "failed" | "unmeasured";
export function buildCitationDetail(selected: CitationObservation, recent: CitationObservation[], videos: CitationVideoMeta[], ownChannelIds: string[], dates: string[], classifyWeb?: (url: string) => "own_web" | "competitor" | "web") {
  const describe = (items: CitationObservation[]) => buildCitationOverview(items, videos, ownChannelIds, [], [], classifyWeb).rows;
  const current = describe([selected])[0];
  const mine = recent.filter(o => o.promptId === selected.promptId);
  const history = dates.map(date => {
    const row = describe(mine.filter(o => citationDate(o.runAt) === date))[0];
    const state: CitationHistoryState = !row ? "unmeasured" : row.status === "failed" ? "failed" : row.webSearch === false ? "searchless" : row.answerPresent === false ? "absent" : !row.measurable ? "unmeasured" : row.hasOwn ? "own" : row.hasUnknown ? "unknown" : row.hasYoutube ? "youtube" : "none";
    return { date, state, runId: row?.id ?? null };
  });
  const measuredDays = history.slice(-7).filter(day => ["own", "youtube", "none", "absent"].includes(day.state));
  const ownDays = measuredDays.filter(day => day.state === "own").length;
  const ownVideos = current.citations.filter(source => current.measurable && source.type === "own" && source.videoId).map(source => {
    const occurrences = recent.filter(o => o.status === "success" && o.webSearch === true && o.answerPresent !== false && o.answerPresent !== null && o.citations.some(c => citationVideoId(c.url) === source.videoId));
    const other = new Map<string, CitationObservation>();
    for (const o of occurrences) {
      if (o.promptId === selected.promptId) continue;
      const previous = other.get(o.promptId);
      if (!previous || previous.runAt < o.runAt) other.set(o.promptId, o);
    }
    return { ...source, videoId: source.videoId!, firstInPeriod: occurrences.length ? occurrences.map(o => citationDate(o.runAt)).sort()[0] : null,
      otherPrompts: [...other.values()].map(o => ({ id: o.id, query: o.query })) };
  });
  return { current, history, ownVideos, retention: { numerator: ownDays, denominator: ownChannelIds.length ? measuredDays.length : 0,
    rate: measuredDays.length && ownChannelIds.length ? ownDays / measuredDays.length : null } };
}
