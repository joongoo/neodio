import type { CollectionRequestSummary } from "@/lib/backend/dataforseo/collectionRequestStore";

export type CollectionRequestDisplayStatus = "queued" | "running" | "completed" | "partially_failed" | "needs_attention" | "cancelled";

export function collectionRequestDisplayStatus(summary: CollectionRequestSummary): CollectionRequestDisplayStatus {
  if (summary.attentionCount > 0) return "needs_attention";
  const finished = summary.completedCount + summary.failedCount + summary.cancelledCount;
  if (finished >= summary.totalTaskCount) {
    if (summary.failedCount > 0) return "partially_failed";
    if (summary.cancelledCount === summary.totalTaskCount) return "cancelled";
    return "completed";
  }
  return summary.runningCount > 0 ? "running" : "queued";
}

export function collectionRequestFinishedCount(summary: CollectionRequestSummary): number {
  return Math.min(summary.totalTaskCount, summary.completedCount + summary.attentionCount + summary.failedCount + summary.cancelledCount);
}
