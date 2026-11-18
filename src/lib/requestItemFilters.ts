export const REQUEST_ITEM_STATUSES = ["reserved", "submitting", "submission_unknown", "queued", "collecting", "raw_saved", "normalized", "completed", "provider_failed", "artifact_failed", "projection_failed", "parse_failed", "cancelled"];
export const REQUEST_ITEM_SURFACES = ["google-aio", "google-ai-mode", "naver-aio", "naver-ai", "gemini"];

export function filterValues(params: URLSearchParams, key: string) {
  return [...new Set(params.getAll(key).flatMap(value => value.split(",")).map(value => value.trim()).filter(value => value && value !== "all"))];
}

export interface RequestItemFacets {
  status: Record<string, number>;
  surface: Record<string, number>;
  retry: { failed: number; cancelled: number };
}
