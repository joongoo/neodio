import assert from "node:assert/strict";
import test from "node:test";
import type { DataForSeoQueueSender } from "./queueWake";
import { followupWakeSeed, isDataForSeoQueueRuntimeReady, providerTaskWakeSeed, publishDataForSeoWake } from "./queueWake";

test("local execution and mock mode never publish to Vercel Queue", () => {
  const ready = { DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password" };
  assert.equal(isDataForSeoQueueRuntimeReady({ ...ready, DATAFORSEO_EXECUTOR: "local" }), false);
  assert.equal(isDataForSeoQueueRuntimeReady({ ...ready, DATAFORSEO_MOCK: "true" }), false);
});

test("requires provider credentials and durable Vercel artifact storage before queue publishing", () => {
  assert.equal(isDataForSeoQueueRuntimeReady({}), false);
  assert.equal(isDataForSeoQueueRuntimeReady({
    DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password",
  }), true);
  assert.equal(isDataForSeoQueueRuntimeReady({
    VERCEL: "1",
    DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password",
  }), false);
  assert.equal(isDataForSeoQueueRuntimeReady({
    VERCEL: "1",
    DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "password", BLOB_READ_WRITE_TOKEN: "blob-token",
  }), true);
});

test("does not publish a queue wake with the local executor", async () => {
  const before = process.env.DATAFORSEO_EXECUTOR;
  process.env.DATAFORSEO_EXECUTOR = "local";
  let calls = 0;
  const sender = (async () => { calls += 1; return { messageId: "message-1" }; }) as DataForSeoQueueSender;
  try {
    const result = await publishDataForSeoWake({
      version: 1, organizationId: "org-1", brandId: "brand-1", clientRequestId: "request-1",
      idempotencySeed: providerTaskWakeSeed(["task-1"]),
    }, sender);
    assert.deepEqual(result, { published: false, messageId: null });
    assert.equal(calls, 0);
  } finally {
    if (before === undefined) delete process.env.DATAFORSEO_EXECUTOR;
    else process.env.DATAFORSEO_EXECUTOR = before;
  }
});

test("publishes an idempotent delayed wake without calling a real queue", async () => {
  const before = {
    login: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD,
    vercel: process.env.VERCEL,
    executor: process.env.DATAFORSEO_EXECUTOR,
    mock: process.env.DATAFORSEO_MOCK,
  };
  process.env.DATAFORSEO_LOGIN = "test-login";
  process.env.DATAFORSEO_PASSWORD = "test-password";
  delete process.env.VERCEL;
  delete process.env.DATAFORSEO_EXECUTOR;
  delete process.env.DATAFORSEO_MOCK;
  const calls: unknown[][] = [];
  const sender = (async (...args: unknown[]) => {
    calls.push(args);
    return { messageId: "message-1" };
  }) as DataForSeoQueueSender;
  try {
    const result = await publishDataForSeoWake({
      version: 1, organizationId: "org-1", brandId: "brand-1", clientRequestId: "request-1",
      idempotencySeed: providerTaskWakeSeed(["task-2", "task-1"]), delaySeconds: 60,
    }, sender);
    assert.deepEqual(result, { published: true, messageId: "message-1" });
    assert.equal(calls[0]?.[0], "dataforseo-collection");
    assert.deepEqual(calls[0]?.[1], {
      version: 1, organizationId: "org-1", brandId: "brand-1", clientRequestId: "request-1",
    });
    assert.match(String((calls[0]?.[2] as { idempotencyKey: string }).idempotencyKey), /^dataforseo:[a-f0-9]{64}$/);
    assert.equal((calls[0]?.[2] as { delaySeconds: number }).delaySeconds, 60);
    assert.equal(providerTaskWakeSeed(["task-1", "task-2"]), providerTaskWakeSeed(["task-2", "task-1"]));
    assert.equal(followupWakeSeed("org-1", "brand-1", 120_000), followupWakeSeed("org-1", "brand-1", 179_999));
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("DATAFORSEO_LOGIN", before.login);
    restore("DATAFORSEO_PASSWORD", before.password);
    restore("VERCEL", before.vercel);
    restore("DATAFORSEO_EXECUTOR", before.executor);
    restore("DATAFORSEO_MOCK", before.mock);
  }
});
