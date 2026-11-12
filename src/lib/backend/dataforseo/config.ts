import type { DataForSeoDevice, DataForSeoSurface } from "./types";

export interface SurfaceConfig {
  postPath: string;
  resultPath: string;
  resultKind: "advanced_result" | "html";
  estimatedCostUsd: number;
  payload(query: string, device: DataForSeoDevice, tag: string): Record<string, unknown>;
}

const googlePayload = (query: string, device: DataForSeoDevice, tag: string) => ({
  keyword: query,
  location_name: "South Korea",
  language_code: "ko",
  device,
  ...(device === "mobile" ? { os: "android" } : {}),
  priority: 1,
  tag,
});

export const DATAFORSEO_SURFACE_CONFIG: Record<DataForSeoSurface, SurfaceConfig> = {
  "google-aio": {
    postPath: "/v3/serp/google/organic/task_post",
    resultPath: "/v3/serp/google/organic/task_get/advanced",
    resultKind: "advanced_result",
    estimatedCostUsd: 0.0012,
    payload: (query, device, tag) => ({ ...googlePayload(query, device, tag), load_async_ai_overview: true }),
  },
  "google-ai-mode": {
    postPath: "/v3/serp/google/ai_mode/task_post",
    resultPath: "/v3/serp/google/ai_mode/task_get/advanced",
    resultKind: "advanced_result",
    estimatedCostUsd: 0.0012,
    payload: googlePayload,
  },
  "naver-aio": {
    postPath: "/v3/serp/naver/organic/task_post",
    resultPath: "/v3/serp/naver/organic/task_get/html",
    resultKind: "html",
    estimatedCostUsd: 0.0006,
    payload: (query, device, tag) => ({
      keyword: query,
      device,
      ...(device === "mobile" ? { os: "android" } : {}),
      priority: 1,
      tag,
    }),
  },
};
