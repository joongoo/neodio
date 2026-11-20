import type { PromptSurface } from "./promptSurfaces";
import { buildCitationOverview, type CitationObservation, type CitationVideoMeta } from "./citationMetrics";
import { supportsAioExposure } from "./citationEngines";

export type CitationDevice = "desktop" | "mobile";
export type CitationDeviceFilter = "all" | CitationDevice;
export const CITATION_DEVICE_LABELS: Record<CitationDeviceFilter, string> = { all: "전체", desktop: "PC", mobile: "모바일" };

export function supportsCitationDevices(engine: PromptSurface) {
  return engine === "google-aio" || engine === "google-ai-mode" || engine === "naver-aio";
}
export function citationDevice(value: unknown, engine: PromptSurface): CitationDeviceFilter {
  return supportsCitationDevices(engine) && (value === "desktop" || value === "mobile") ? value : "all";
}

export function buildDeviceCitationOverview(observations: CitationObservation[], videos: CitationVideoMeta[], channels: string[], dates: string[],
  tracked: { id: string; query: string }[], engine: PromptSurface, device: CitationDeviceFilter,
  classifyWeb?: (url: string) => "own_web" | "competitor" | "web") {
  const selected = citationDevice(device, engine);
  const build = (items: CitationObservation[]) => buildCitationOverview(items, videos, channels, dates, tracked, classifyWeb);
  const deviceSummaries = supportsCitationDevices(engine) ? (["desktop", "mobile"] as const).map(device => {
    const o = build(observations.filter(item => item.device === device));
    return { device, tracked: o.rows.length, measured: supportsAioExposure(engine) ? o.exposureMeasured : o.measured, answerMeasured: o.measured,
      exposureRate: o.exposureRate, youtubeRate: o.youtubeRate, ownRate: o.ownRate, ownVideos: o.ownVideos };
  }) : [];
  return { ...build(selected === "all" ? observations : observations.filter(item => item.device === selected)), deviceSummaries,
    hasUnknownDevice: supportsCitationDevices(engine) && observations.some(item => !item.device) };
}
export type CitationDeviceSummary = ReturnType<typeof buildDeviceCitationOverview>["deviceSummaries"][number];
