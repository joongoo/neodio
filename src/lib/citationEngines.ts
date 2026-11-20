import type { PromptSurface } from "./promptSurfaces";

export const CITATION_ENGINES: Record<PromptSurface, string> = {
  "google-aio": "Google AIO", gemini: "Gemini", "google-ai-mode": "Google AI 모드", "naver-aio": "네이버 AIO", "naver-ai": "네이버 AI",
};
export function citationEngine(value: unknown): PromptSurface {
  return typeof value === "string" && Object.hasOwn(CITATION_ENGINES, value) ? value as PromptSurface : "google-aio";
}

/** Search overviews have a measured present/absent result; chat engines do not. */
export function supportsAioExposure(engine: PromptSurface) {
  return engine === "google-aio" || engine === "naver-aio";
}
