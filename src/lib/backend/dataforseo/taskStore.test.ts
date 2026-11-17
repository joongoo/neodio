import assert from "node:assert/strict";
import test from "node:test";
import { MemoryProviderTaskStore, type ReserveProviderTaskInput } from "./taskStore";

function inputs(count: number): ReserveProviderTaskInput[] {
  return Array.from({ length: count }, (_, index) => ({
    organizationId: "org-1",
    brandId: "brand-1",
    promptId: `prompt-${index}`,
    collectionRequestId: "creq-1",
    query: `CRM 추천 ${index}`,
    surface: "google-aio",
    device: "desktop",
    marketId: "market-kr",
    scheduledWindow: "manual:request-1",
  }));
}

test("multiple workers cannot claim beyond the global in-flight limit", async () => {
  const store = new MemoryProviderTaskStore();
  await store.reserveMany(inputs(25));
  const first = await store.claimReserved({
    owner: "worker-a",
    limit: 20,
    maxInFlight: 20,
    leaseMs: 60_000,
    now: "2026-11-17T10:00:00.000Z",
  });
  const second = await store.claimReserved({
    owner: "worker-b",
    limit: 20,
    maxInFlight: 20,
    leaseMs: 60_000,
    now: "2026-11-17T10:00:01.000Z",
  });

  assert.equal(first.length, 20);
  assert.equal(second.length, 0);
  assert.equal(first.every((task) => task.leaseOwner === "worker-a"), true);
});

test("one terminal task opens exactly one new submission slot", async () => {
  const store = new MemoryProviderTaskStore();
  await store.reserveMany(inputs(25));
  const claimed = await store.claimReserved({
    owner: "worker-a",
    limit: 20,
    maxInFlight: 20,
    leaseMs: 60_000,
    now: "2026-11-17T10:00:00.000Z",
  });
  for (const task of claimed.slice(0, 19)) await store.update(task.id, "reserved", { status: "queued" });
  await store.update(claimed[0].id, "queued", { status: "completed", completedAt: "2026-11-17T10:00:02.000Z" });

  const next = await store.claimReserved({
    owner: "worker-b",
    limit: 20,
    maxInFlight: 20,
    leaseMs: 60_000,
    now: "2026-11-17T10:00:03.000Z",
  });
  assert.equal(next.length, 1);
});

test("an expired reserved lease can be reclaimed without submitting it automatically", async () => {
  const store = new MemoryProviderTaskStore();
  const [{ task }] = await store.reserveMany(inputs(1));
  await store.claimReserved({
    owner: "worker-a",
    limit: 1,
    maxInFlight: 1,
    leaseMs: 1_000,
    now: "2026-11-17T10:00:00.000Z",
  });
  const reclaimed = await store.claimReserved({
    owner: "worker-b",
    limit: 1,
    maxInFlight: 1,
    leaseMs: 1_000,
    now: "2026-11-17T10:00:02.000Z",
  });

  assert.equal(reclaimed[0]?.id, task.id);
  assert.equal(reclaimed[0]?.status, "reserved");
  assert.equal(reclaimed[0]?.leaseOwner, "worker-b");
});
