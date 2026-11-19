import assert from "node:assert/strict";
import test from "node:test";
import { MemoryProviderTaskStore, type ReserveProviderTaskInput } from "./taskStore";
import { SubmitWorker, type ProviderTaskSubmitter } from "./submitWorker";
import { StaleTaskSweeper } from "./staleTaskSweeper";

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

test("restart after claim but before submission reuses the same reservation and fences the old owner", async () => {
  const store = new MemoryProviderTaskStore();
  const [{ task }] = await store.reserveMany(inputs(1));
  await store.claimReserved({ owner: "dead", limit: 1, maxInFlight: 1, leaseMs: 60_000, now: "2026-11-18T00:00:00.000Z" });
  let paidPosts = 0;
  const restarted = new SubmitWorker(store, { submit: async (id, owner) => {
    assert.equal(await store.beginSubmission(id, "dead", "2026-11-18T00:01:02.000Z"), null);
    assert.ok(await store.beginSubmission(id, owner!, "2026-11-18T00:01:02.000Z"));
    paidPosts++;
    return store.update(id, "submitting", { status: "queued", providerTaskId: "remote-same-task", leaseOwner: null, leaseExpiresAt: null });
  } });
  const input = { owner: "restart", batchSize: 1, maxInFlight: 1, leaseMs: 60_000 };
  assert.equal((await restarted.runOnce({ ...input, now: "2026-11-18T00:00:30.000Z" })).claimed, 0);
  assert.equal((await restarted.runOnce({ ...input, now: "2026-11-18T00:01:01.000Z" })).claimed, 1);
  assert.equal(paidPosts, 1);
  assert.equal(store.tasks.size, 1);
  assert.equal((await store.get(task.id))?.providerTaskId, "remote-same-task");
});

test("lost submission response survives restart as unknown without any automatic paid retry", async () => {
  const store = new MemoryProviderTaskStore();
  const [{ task }] = await store.reserveMany(inputs(1));
  let paidPosts = 0;
  const createWorker = () => new SubmitWorker(store, { submit: async (id, owner) => {
    assert.ok(await store.beginSubmission(id, owner!, "2026-11-18T00:00:01.000Z"));
    paidPosts++;
    throw Error("simulated process loss after paid POST, before response persistence");
  } });
  const input = { owner: "old", batchSize: 1, maxInFlight: 1, leaseMs: 60_000, now: "2026-11-18T00:00:00.000Z" };
  assert.equal((await createWorker().runOnce(input)).errors.length, 1);
  assert.equal((await createWorker().runOnce({ ...input, owner: "restart", now: "2026-11-18T00:02:00.000Z" })).claimed, 0);
  const swept = await new StaleTaskSweeper(store).runOnce({ limit: 10, staleAfterMs: 300_000, now: "2026-11-18T00:06:00.000Z" });
  assert.equal(swept.quarantined, 1);
  assert.equal((await createWorker().runOnce({ ...input, owner: "retry-wake", now: "2026-11-18T00:07:00.000Z" })).claimed, 0);
  assert.equal(paidPosts, 1);
  assert.equal(store.tasks.size, 1);
  assert.equal((await store.get(task.id))?.status, "submission_unknown");
});

test("duplicate concurrent wakes submit an approved reservation once", async () => {
  const store = new MemoryProviderTaskStore();
  await store.reserveMany(inputs(1));
  let paidPosts = 0;
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const submitter: ProviderTaskSubmitter = { submit: async (id, owner) => {
    assert.ok(await store.beginSubmission(id, owner!, "2026-11-18T00:00:01.000Z"));
    paidPosts++;
    await gate;
    return store.update(id, "submitting", { status: "queued", providerTaskId: "remote-one", leaseOwner: null, leaseExpiresAt: null });
  } };
  const input = { batchSize: 1, maxInFlight: 1, leaseMs: 60_000, now: "2026-11-18T00:00:00.000Z" };
  const first = new SubmitWorker(store, submitter).runOnce({ ...input, owner: "wake-a" });
  try {
    const duplicate = await new SubmitWorker(store, submitter).runOnce({ ...input, owner: "wake-b" });
    assert.equal(duplicate.claimed, 0);
  } finally { unblock(); }
  assert.equal((await first).claimed, 1);
  assert.equal((await new SubmitWorker(store, submitter).runOnce({ ...input, owner: "wake-c" })).claimed, 0);
  assert.equal(paidPosts, 1);
});

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
