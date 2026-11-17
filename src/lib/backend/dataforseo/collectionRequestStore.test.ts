import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCollectionRequestStore } from "./collectionRequestStore";

test("stores one user-approved collection request with its expected cost", async () => {
  const store = new MemoryCollectionRequestStore();
  const request = await store.create({
    organizationId: "org-1",
    brandId: "brand-1",
    requestedBy: "user-1",
    requestKind: "manual",
    totalTaskCount: 2_000,
    estimatedCostUsd: 2.4,
    approvedAt: "2026-11-17T09:00:00.000Z",
  });

  assert.match(request.id, /^creq-/);
  assert.equal(request.status, "queued");
  assert.equal(request.totalTaskCount, 2_000);
  assert.equal(request.estimatedCostUsd, 2.4);
  assert.equal(request.actualCostUsd, 0);
  assert.deepEqual(await store.get(request.id), request);
});

test("rejects a collection request without tasks or with a negative cost", async () => {
  const store = new MemoryCollectionRequestStore();
  await assert.rejects(
    store.create({ organizationId: "org-1", requestKind: "manual", totalTaskCount: 0, estimatedCostUsd: 0 }),
    /하나 이상의 task/,
  );
  await assert.rejects(
    store.create({ organizationId: "org-1", requestKind: "manual", totalTaskCount: 1, estimatedCostUsd: -1 }),
    /예상 비용/,
  );
});
