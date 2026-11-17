import assert from "node:assert/strict";
import test from "node:test";
import { StaleTaskSweeper } from "./staleTaskSweeper";
import { MemoryProviderTaskStore } from "./taskStore";

const input = {
  organizationId: "org-1", brandId: "brand-1", promptId: "prompt-1", query: "CRM 추천",
  surface: "google-aio" as const, device: "desktop" as const, marketId: "market-kr", scheduledWindow: "manual:request-1",
};

test("quarantines an expired submitting task without creating a replacement", async () => {
  const store = new MemoryProviderTaskStore();
  const { task } = await store.reserve(input);
  await store.update(task.id, "reserved", {
    status: "submitting",
    submissionAttemptedAt: "2026-11-17T09:50:00.000Z",
    leaseOwner: "dead-worker",
    leaseExpiresAt: "2026-11-17T09:52:00.000Z",
  });

  const result = await new StaleTaskSweeper(store).runOnce({
    limit: 20, staleAfterMs: 5 * 60_000, now: "2026-11-17T10:00:00.000Z",
  });

  assert.equal(result.quarantined, 1);
  assert.equal(result.tasks[0]?.status, "submission_unknown");
  assert.equal(result.tasks[0]?.errorCode, "submission_stale");
  assert.equal(result.tasks[0]?.leaseOwner, null);
  assert.equal(store.tasks.size, 1);
});

test("keeps a recent submission or live lease untouched", async () => {
  const store = new MemoryProviderTaskStore();
  const recent = await store.reserve({ ...input, promptId: "prompt-recent", scheduledWindow: "manual:recent" });
  const liveLease = await store.reserve({ ...input, promptId: "prompt-live", scheduledWindow: "manual:live" });
  await store.update(recent.task.id, "reserved", {
    status: "submitting", submissionAttemptedAt: "2026-11-17T09:58:00.000Z",
    leaseOwner: "worker-a", leaseExpiresAt: "2026-11-17T09:59:00.000Z",
  });
  await store.update(liveLease.task.id, "reserved", {
    status: "submitting", submissionAttemptedAt: "2026-11-17T09:40:00.000Z",
    leaseOwner: "worker-b", leaseExpiresAt: "2026-11-17T10:01:00.000Z",
  });

  const result = await new StaleTaskSweeper(store).runOnce({
    limit: 20, staleAfterMs: 5 * 60_000, now: "2026-11-17T10:00:00.000Z",
  });

  assert.equal(result.quarantined, 0);
  assert.equal((await store.get(recent.task.id))?.status, "submitting");
  assert.equal((await store.get(liveLease.task.id))?.status, "submitting");
});
