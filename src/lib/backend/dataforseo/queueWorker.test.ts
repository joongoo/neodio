import assert from "node:assert/strict";
import test from "node:test";
import { DataForSeoQueueWorker } from "./queueWorker";

test("queue worker recovers results before filling submission slots", async () => {
  const calls: string[] = [];
  const worker = new DataForSeoQueueWorker(
    {
      runOnce: async (input) => {
        calls.push(`recover:${input.owner}:${input.batchSize}`);
        return { claimed: 1, tasks: [], errors: [] };
      },
    },
    {
      runOnce: async (input) => {
        calls.push(`submit:${input.owner}:${input.batchSize}:${input.maxInFlight}`);
        return { claimed: 2, tasks: [], errors: [] };
      },
    },
    {
      runOnce: async () => {
        calls.push("stale");
        return { quarantined: 1, tasks: [] };
      },
    },
  );

  const result = await worker.runOnce({
    owner: "cron-1", submitBatchSize: 20, recoveryBatchSize: 40, maxInFlight: 20, leaseMs: 120_000,
    staleSubmissionAfterMs: 300_000,
  });

  assert.deepEqual(calls, ["stale", "recover:cron-1:recovery:40", "submit:cron-1:submit:20:20"]);
  assert.equal(result.stale.quarantined, 1);
  assert.equal(result.recovery.claimed, 1);
  assert.equal(result.submission.claimed, 2);
});
