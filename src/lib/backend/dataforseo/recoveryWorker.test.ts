import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryWorker } from "./recoveryWorker";
import { MemoryProviderTaskStore } from "./taskStore";
import { SubmitWorker } from "./submitWorker";

test("restart after recovery interruption resumes the existing provider task, never submission", async () => {
  const store = new MemoryProviderTaskStore();
  const { task } = await store.reserve({ organizationId: "org-1", query: "recover", surface: "google-aio", device: "desktop", marketId: "market-kr", scheduledWindow: "manual:restart" });
  await store.update(task.id, "reserved", { status: "queued", providerTaskId: "remote-existing", nextPollAt: "2026-11-18T00:00:00.000Z" });
  const input = { owner: "dead", batchSize: 1, leaseMs: 60_000, now: "2026-11-18T00:00:00.000Z" };
  const dead = new RecoveryWorker(store, { recover: async () => { throw Error("interrupted GET"); } });
  assert.equal((await dead.runOnce(input)).errors.length, 1);
  let recoveries = 0;
  const restarted = new RecoveryWorker(store, { recover: async (id, owner) => {
    const existing = await store.get(id);
    assert.equal(existing?.providerTaskId, "remote-existing");
    assert.equal(existing?.leaseOwner, owner);
    recoveries++;
    return { task: await store.update(id, "queued", { status: "completed", completedAt: "2026-11-18T00:01:02.000Z", leaseOwner: null, leaseExpiresAt: null, nextPollAt: null }), observation: null };
  } });
  assert.equal((await restarted.runOnce({ ...input, owner: "restart", now: "2026-11-18T00:00:30.000Z" })).claimed, 0);
  assert.equal((await restarted.runOnce({ ...input, owner: "restart", now: "2026-11-18T00:01:01.000Z" })).claimed, 1);
  assert.equal((await restarted.runOnce({ ...input, owner: "duplicate", now: "2026-11-18T00:02:00.000Z" })).claimed, 0);
  let submissions = 0;
  const submit = new SubmitWorker(store, { submit: async () => { submissions++; throw Error("must not submit"); } });
  assert.equal((await submit.runOnce({ ...input, owner: "submit", maxInFlight: 20, now: "2026-11-18T00:02:00.000Z" })).claimed, 0);
  assert.equal(submissions, 0);
  assert.equal(recoveries, 1);
  assert.equal(store.tasks.size, 1);
});

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
