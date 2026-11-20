import type { PromptSurface } from "./promptSurfaces";

export function citationRedirect(base: string, engine: PromptSurface, params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const key of ["range", "q", "citation", "promptPage", "videoPage", "size", "videoSize", "run"]) {
    if (typeof params[key] === "string") query.set(key, params[key]);
  }
  query.set("engine", engine);
  return `${base}/citations?${query}${query.has("run") ? "#citation-answer" : ""}`;
}
