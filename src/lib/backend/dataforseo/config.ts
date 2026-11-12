import type { DataForSeoDevice, DataForSeoSurface } from "./types";
import { SERP_API_ESTIMATED_COST_USD } from "@/lib/dataforseoPricing";

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
    estimatedCostUsd: SERP_API_ESTIMATED_COST_USD["google-aio"],
    payload: (query, device, tag) => ({ ...googlePayload(query, device, tag), load_async_ai_overview: true }),
  },
  "google-ai-mode": {
    postPath: "/v3/serp/google/ai_mode/task_post",
    resultPath: "/v3/serp/google/ai_mode/task_get/advanced",
    resultKind: "advanced_result",
    estimatedCostUsd: SERP_API_ESTIMATED_COST_USD["google-ai-mode"],
    payload: googlePayload,
  },
  "naver-aio": {
    postPath: "/v3/serp/naver/organic/task_post",
    resultPath: "/v3/serp/naver/organic/task_get/html",
    resultKind: "html",
    estimatedCostUsd: SERP_API_ESTIMATED_COST_USD["naver-aio"],
    payload: (query, device, tag) => ({
      keyword: query,
      device,
      ...(device === "mobile" ? { os: "android" } : {}),
      priority: 1,
      tag,
    }),
  },
};
