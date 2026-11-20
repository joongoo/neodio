import type { PromptSurface } from "./promptSurfaces";
import { citationDevice, supportsCitationDevices } from "./citationDevices";

export function citationRedirect(base: string, engine: PromptSurface, params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of ["range", "q", "citation", "promptPage", "videoPage", "size", "videoSize", "run"]) {
    if (typeof params[key] === "string") query.set(key, params[key]);
  }
  query.set("engine", engine);
  if (supportsCitationDevices(engine) && typeof params.device === "string") query.set("device", citationDevice(params.device, engine));
  return `${base}/citations?${query}${query.has("run") ? "#citation-answer" : ""}`;
}

export function citationDetailHref(path: string, runId: string, engine: PromptSurface, params: Record<string, string | string[] | undefined> = {}) {
  const query = new URLSearchParams();
  for (const key of ["range", "q", "citation", "promptPage", "videoPage", "size", "videoSize"]) {
    if (typeof params[key] === "string") query.set(key, params[key]);
  }
  query.set("engine", engine);
  if (supportsCitationDevices(engine) && typeof params.device === "string") query.set("device", citationDevice(params.device, engine));
  return `${path}/${encodeURIComponent(runId)}?${query}`;
}
