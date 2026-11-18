import type { RequestItemRow } from "@/lib/backend/dataforseo/requestItems";
import { SERP_API_ESTIMATED_COST_USD, type SerpApiSurface } from "./dataforseoPricing";

export type RetrySelectionItem = Pick<RequestItemRow, "id" | "executionKind" | "query" | "surface" | "device" | "status">;
// Unknown submissions and saved artifacts must be reconciled, not paid for again.
export const RETRY_FAILURE_STATUSES = ["provider_failed", "parse_failed"] as const;
export function isRetryFailure(item: RetrySelectionItem) {
  return (RETRY_FAILURE_STATUSES as readonly string[]).includes(item.status);
}
export function isRetrySelectable(item: RetrySelectionItem) {
  return isRetryFailure(item) || item.status === "cancelled" || (item.executionKind === "legacy" && ["reserved", "collecting"].includes(item.status));
}

export function retrySelectionCost(items: RetrySelectionItem[]) {
  // Each item already represents one exact engine/device observation.
  return items.reduce((sum, item) => sum + (item.executionKind === "serp-api" ? SERP_API_ESTIMATED_COST_USD[item.surface as SerpApiSurface] : 0), 0);
}
