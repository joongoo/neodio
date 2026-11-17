import assert from "node:assert/strict";
import test from "node:test";
import { CollectionQueueService } from "./collectionQueue";
import { MemoryCollectionRequestStore } from "./collectionRequestStore";
import { MemoryProviderTaskStore } from "./taskStore";

test("stores an approved request and all provider tasks in one transaction boundary", async () => {
  const requests = new MemoryCollectionRequestStore();
  const tasks = new MemoryProviderTaskStore();
  let transactions = 0;
  const queue = new CollectionQueueService(requests, tasks, async (work) => {
    transactions += 1;
    return work();
  });

  const queued = await queue.enqueueApproved({
    organizationId: "org-1",
    brandId: "brand-1",
    requestedBy: "user-1",
    clientRequestId: "manual-request-1",
    requestKind: "manual",
    tasks: [
      {
        promptId: "prompt-1",
        query: "CRM 추천",
        surface: "google-aio",
        device: "desktop",
        marketId: "market-kr",
        scheduledWindow: "manual:request-1",
      },
      {
        promptId: "prompt-2",
        query: "ERP 추천",
        surface: "naver-aio",
        device: "desktop",
        marketId: "market-kr",
        scheduledWindow: "manual:request-1",
      },
    ],
  });

  assert.equal(transactions, 1);
  assert.equal(queued.request.totalTaskCount, 2);
  assert.equal(queued.request.clientRequestId, "manual-request-1");
  assert.equal(queued.request.estimatedCostUsd, 0.0018);
  assert.equal(queued.tasks.length, 2);
  assert.equal(queued.tasks.every((task) => task.collectionRequestId === queued.request.id), true);
});

test("does not open a transaction for an empty approved request", async () => {
  let transactions = 0;
  const queue = new CollectionQueueService(
    new MemoryCollectionRequestStore(),
    new MemoryProviderTaskStore(),
    async (work) => {
      transactions += 1;
      return work();
    },
  );

  await assert.rejects(
    queue.enqueueApproved({ organizationId: "org-1", requestKind: "manual", tasks: [] }),
    /하나 이상의 task/,
  );
  assert.equal(transactions, 0);
});

test("queues 2,000 provider tasks as one approved collection", async () => {
  const queue = new CollectionQueueService(
    new MemoryCollectionRequestStore(),
    new MemoryProviderTaskStore(),
    async (work) => work(),
  );
  const queued = await queue.enqueueApproved({
    organizationId: "org-1",
    brandId: "brand-1",
    requestKind: "manual",
    tasks: Array.from({ length: 2_000 }, (_, index) => ({
      promptId: `prompt-${index}`,
      query: `CRM 추천 ${index}`,
      surface: "google-aio" as const,
      device: "desktop" as const,
      marketId: "market-kr",
      scheduledWindow: "manual:request-large",
    })),
  });

  assert.equal(queued.request.totalTaskCount, 2_000);
  assert.equal(queued.request.estimatedCostUsd.toFixed(4), "2.4000");
  assert.equal(queued.tasks.length, 2_000);
  assert.equal(new Set(queued.tasks.map((task) => task.id)).size, 2_000);
});

test("rejects duplicate tasks before storing a partial bulk reservation", async () => {
  const queue = new CollectionQueueService(
    new MemoryCollectionRequestStore(),
    new MemoryProviderTaskStore(),
    async (work) => work(),
  );
  const duplicate = {
    promptId: "prompt-1",
    query: "CRM 추천",
    surface: "google-aio" as const,
    device: "desktop" as const,
    marketId: "market-kr",
    scheduledWindow: "manual:request-duplicate",
  };
  await assert.rejects(
    queue.enqueueApproved({
      organizationId: "org-1",
      brandId: "brand-1",
      requestKind: "manual",
      tasks: [duplicate, duplicate],
    }),
    /중복된 Provider task/,
  );
});
