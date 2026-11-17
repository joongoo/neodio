import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRequestSummary } from "@/lib/backend/dataforseo/collectionRequestStore";
import { collectionRequestDisplayStatus, collectionRequestFinishedCount } from "./collectionRequestProgress";

function summary(patch: Partial<CollectionRequestSummary> = {}): CollectionRequestSummary {
  return {
    id: "creq-1", organizationId: "org-1", brandId: "brand-1", requestedBy: null, requestKind: "manual",
    status: "queued", totalTaskCount: 10, estimatedCostUsd: 0.024, actualCostUsd: 0,
    cancelRequested: false, retryOfRequestId: null, createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:00:00.000Z", approvedAt: "2026-11-17T00:00:00.000Z", completedAt: null,
    waitingCount: 10, runningCount: 0, completedCount: 0, attentionCount: 0, failedCount: 0, cancelledCount: 0,
    ...patch,
  };
}

test("request progress prioritizes uncertain submissions for cost protection", () => {
  assert.equal(collectionRequestDisplayStatus(summary({ waitingCount: 8, attentionCount: 1 })), "needs_attention");
});

test("request progress distinguishes running, partial failure, and completion", () => {
  assert.equal(collectionRequestDisplayStatus(summary({ waitingCount: 5, runningCount: 5 })), "running");
  assert.equal(collectionRequestDisplayStatus(summary({ waitingCount: 0, completedCount: 9, failedCount: 1 })), "partially_failed");
  assert.equal(collectionRequestDisplayStatus(summary({ waitingCount: 0, completedCount: 10 })), "completed");
  assert.equal(collectionRequestFinishedCount(summary({ completedCount: 8, failedCount: 1 })), 9);
});
