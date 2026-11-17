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
