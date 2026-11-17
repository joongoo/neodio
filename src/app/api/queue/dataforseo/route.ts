import { randomUUID } from "node:crypto";
import { handleCallback } from "@vercel/queue";
import { createDataForSeoOrchestrator } from "@/lib/backend/dataforseo";
import { DataForSeoQueueWorker } from "@/lib/backend/dataforseo/queueWorker";
import {
  followupWakeSeed,
  isDataForSeoQueueRuntimeReady,
  isDataForSeoQueueMessage,
  publishDataForSeoWake,
  type DataForSeoQueueMessage,
} from "@/lib/backend/dataforseo/queueWake";
import { RecoveryWorker } from "@/lib/backend/dataforseo/recoveryWorker";
import { SubmitWorker } from "@/lib/backend/dataforseo/submitWorker";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";

export const runtime = "nodejs";
export const maxDuration = 60;

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export const POST = handleCallback<DataForSeoQueueMessage>(async (message, metadata) => {
  if (!isDataForSeoQueueMessage(message)) throw new Error("올바르지 않은 DataForSEO queue 메시지입니다.");
  if (!isDataForSeoQueueRuntimeReady()) return;

  const taskStore = new PostgresProviderTaskStore();
  const orchestrator = createDataForSeoOrchestrator(taskStore);
  const worker = new DataForSeoQueueWorker(
    new RecoveryWorker(taskStore, orchestrator),
    new SubmitWorker(taskStore, orchestrator),
  );
  await worker.runOnce({
    owner: `queue-${metadata.messageId}-${randomUUID()}`,
    submitBatchSize: positiveInteger(process.env.DATAFORSEO_SUBMIT_BATCH_SIZE, 20, 20),
    recoveryBatchSize: positiveInteger(process.env.DATAFORSEO_RECOVERY_BATCH_SIZE, 40, 100),
    maxInFlight: positiveInteger(process.env.DATAFORSEO_MAX_IN_FLIGHT, 20, 100),
    leaseMs: 120_000,
  });

  const activity = await taskStore.getActivitySummary(message.organizationId, message.brandId);
  if (activity.runningCount === 0) return;
  const delaySeconds = positiveInteger(process.env.DATAFORSEO_QUEUE_DELAY_SECONDS, 60, 3_600);
  const dueAtMs = Date.now() + delaySeconds * 1_000;
  await publishDataForSeoWake({
    ...message,
    delaySeconds,
    idempotencySeed: followupWakeSeed(message.organizationId, message.brandId, dueAtMs),
  });
});
