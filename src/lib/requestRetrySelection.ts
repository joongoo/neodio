import type { RequestItemRow } from "@/lib/backend/dataforseo/requestItems";
import { SERP_API_ESTIMATED_COST_USD, type SerpApiSurface } from "./dataforseoPricing";

export type RetrySelectionItem = Pick<RequestItemRow, "id" | "executionKind" | "query" | "surface" | "device" | "status"> & { hasRetry?: boolean; retries?: RequestItemRow["retries"]; canManagePending?: boolean; estimatedCostUsd?: number };
export type RetrySelectionGroup = "failed" | "cancelled";
// Unknown submissions and saved artifacts must be reconciled, not paid for again.
export const RETRY_FAILURE_STATUSES = ["provider_failed"] as const;
export function isRetryFailure(item: RetrySelectionItem) {
  return (RETRY_FAILURE_STATUSES as readonly string[]).includes(item.status);
}
export function isRetrySelectable(item: RetrySelectionItem) {
  if (item.hasRetry || item.retries?.length) return false;
  return isRetryFailure(item) || item.status === "cancelled" || (item.executionKind === "legacy" && ["reserved", "collecting"].includes(item.status)) || (item.executionKind === "serp-api" && item.status === "reserved" && item.canManagePending === true);
}

export function isPendingSerpSelection(items: RetrySelectionItem[]) {
  return items.length > 0 && items.every(item => item.executionKind === "serp-api" && item.status === "reserved" && item.canManagePending === true && isRetrySelectable(item));
}

export function selectionAvailableActions(items: RetrySelectionItem[]) {
  const pendingSerp = isPendingSerpSelection(items);
  const selectable = items.length > 0 && items.every(isRetrySelectable);
  return {
    canCollect: pendingSerp || (selectable && !items.some(item => item.executionKind === "serp-api" && item.status === "reserved")),
    canCancel: pendingSerp || (selectable && items.every(item => item.executionKind === "legacy" && item.status === "reserved")),
  };
}

export function pendingSelectionCost(items: RetrySelectionItem[]) {
  return items.reduce((sum, item) => sum + (item.estimatedCostUsd ?? SERP_API_ESTIMATED_COST_USD[item.surface as SerpApiSurface]), 0);
}

export function reconcileRetrySelection(selected: ReadonlyMap<string, RetrySelectionItem>, visible: RetrySelectionItem[]) {
  const next = new Map(selected);
  for (const item of visible) if (next.has(item.id)) {
    if (isRetrySelectable(item)) next.set(item.id, item);
    else next.delete(item.id);
  }
  return next;
}

export function retryGroupSelected(selected: ReadonlyMap<string, RetrySelectionItem>, candidates: RetrySelectionItem[]) {
  return candidates.length > 0 && candidates.every(item => selected.has(item.id));
}

export function mergeRetrySelection(selected: ReadonlyMap<string, RetrySelectionItem>, candidates: RetrySelectionItem[], add: boolean) {
  const next = new Map(selected);
  for (const item of candidates) {
    if (add && isRetrySelectable(item)) next.set(item.id, item);
    else next.delete(item.id);
  }
  return next;
}

export function retrySelectionCost(items: RetrySelectionItem[]) {
  // Each item already represents one exact engine/device observation.
  return items.reduce((sum, item) => sum + (item.executionKind === "serp-api" ? SERP_API_ESTIMATED_COST_USD[item.surface as SerpApiSurface] : 0), 0);
}
