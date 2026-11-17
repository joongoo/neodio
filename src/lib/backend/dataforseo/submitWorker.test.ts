import assert from "node:assert/strict";
import test from "node:test";
import { MemoryProviderTaskStore, type ReserveProviderTaskInput } from "./taskStore";
import { SubmitWorker, type ProviderTaskSubmitter } from "./submitWorker";

function inputs(count: number): ReserveProviderTaskInput[] {
  return Array.from({ length: count }, (_, index) => ({
    organizationId: "org-1",
    brandId: "brand-1",
    collectionRequestId: "creq-1",
    promptId: `prompt-${index}`,
    query: `CRM 추천 ${index}`,
    surface: "google-aio",
    device: "desktop",
    marketId: "market-kr",
    scheduledWindow: "manual:request-1",
  }));
}

test("submits only tasks claimed by the worker and clears their leases", async () => {
  const store = new MemoryProviderTaskStore();
  await store.reserveMany(inputs(3));
  const calls: string[] = [];
  const submitter: ProviderTaskSubmitter = {
    submit: async (id, owner) => {
      calls.push(id);
      const submitting = await store.beginSubmission(id, owner ?? "", "2026-11-17T10:00:01.000Z");
      assert.ok(submitting);
      return store.update(id, "submitting", {
        status: "queued",
        providerTaskId: `remote-${id}`,
        submittedAt: "2026-11-17T10:00:02.000Z",
        leaseOwner: null,
        leaseExpiresAt: null,
        nextPollAt: "2026-11-17T10:00:02.000Z",
      });
    },
  };
  const result = await new SubmitWorker(store, submitter).runOnce({
    owner: "worker-a",
    batchSize: 2,
    maxInFlight: 20,
    leaseMs: 60_000,
    now: "2026-11-17T10:00:00.000Z",
  });

  assert.equal(result.claimed, 2);
  assert.equal(result.errors.length, 0);
  assert.equal(calls.length, 2);
  assert.equal(result.tasks.every((task) => task.status === "queued" && task.leaseOwner === null), true);
});

test("does not automatically resubmit an unknown submission", async () => {
  const store = new MemoryProviderTaskStore();
  await store.reserveMany(inputs(1));
  let calls = 0;
  const submitter: ProviderTaskSubmitter = {
    submit: async (id, owner) => {
      calls += 1;
      const submitting = await store.beginSubmission(id, owner ?? "", "2026-11-17T10:00:01.000Z");
      assert.ok(submitting);
      return store.update(id, "submitting", {
        status: "submission_unknown",
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: "network",
        errorMessage: "응답 유실",
      });
    },
  };
  const worker = new SubmitWorker(store, submitter);
  await worker.runOnce({ owner: "worker-a", batchSize: 1, maxInFlight: 20, leaseMs: 60_000, now: "2026-11-17T10:00:00.000Z" });
  const second = await worker.runOnce({ owner: "worker-b", batchSize: 1, maxInFlight: 20, leaseMs: 60_000, now: "2026-11-17T10:01:00.000Z" });

  assert.equal(calls, 1);
  assert.equal(second.claimed, 0);
});
