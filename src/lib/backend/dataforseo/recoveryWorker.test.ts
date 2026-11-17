import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryWorker } from "./recoveryWorker";
import { MemoryProviderTaskStore } from "./taskStore";

test("recovery worker processes only claimed due tasks", async () => {
  const store = new MemoryProviderTaskStore();
  const due = await store.reserve({
    organizationId: "org-1", query: "due", surface: "google-aio", device: "desktop",
    marketId: "market-kr", scheduledWindow: "manual:due",
  });
  const future = await store.reserve({
    organizationId: "org-1", query: "future", surface: "google-aio", device: "desktop",
    marketId: "market-kr", scheduledWindow: "manual:future",
  });
  await store.update(due.task.id, "reserved", {
    status: "queued", providerTaskId: "provider-due", nextPollAt: "2026-11-17T09:59:00.000Z",
  });
  await store.update(future.task.id, "reserved", {
    status: "queued", providerTaskId: "provider-future", nextPollAt: "2026-11-17T10:01:00.000Z",
  });

  const recoveredIds: string[] = [];
  const worker = new RecoveryWorker(store, {
    recover: async (id, owner) => {
      const task = await store.get(id);
      assert.equal(task?.leaseOwner, owner);
      recoveredIds.push(id);
      const completed = await store.update(id, task!.status, {
        status: "completed", leaseOwner: null, leaseExpiresAt: null, nextPollAt: null,
        completedAt: "2026-11-17T10:00:01.000Z",
      });
      return { task: completed, observation: null };
    },
  });

  const result = await worker.runOnce({
    owner: "recovery-a", batchSize: 10, leaseMs: 60_000, now: "2026-11-17T10:00:00.000Z",
  });

  assert.equal(result.claimed, 1);
  assert.deepEqual(recoveredIds, [due.task.id]);
  assert.equal(result.tasks[0]?.status, "completed");
  assert.equal((await store.get(future.task.id))?.status, "queued");
});
