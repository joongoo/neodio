import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getPromptStore } from "../src/lib/backend/database";
import { createDataForSeoOrchestrator } from "../src/lib/backend/dataforseo";
import { DataForSeoQueueWorker } from "../src/lib/backend/dataforseo/queueWorker";
import { RecoveryWorker } from "../src/lib/backend/dataforseo/recoveryWorker";
import { SubmitWorker } from "../src/lib/backend/dataforseo/submitWorker";
import { StaleTaskSweeper } from "../src/lib/backend/dataforseo/staleTaskSweeper";
import { PostgresProviderTaskStore } from "../src/lib/backend/dataforseo/taskStore";

function positive(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || process.env.DATAFORSEO_EXECUTOR !== "local") {
    throw new Error("Local worker requires DATAFORSEO_EXECUTOR=local outside production/Vercel.");
  }
  if (!["true", "false"].includes(process.env.DATAFORSEO_MOCK ?? "")) {
    throw new Error("Explicitly set DATAFORSEO_MOCK=true or false before starting the local worker.");
  }
  const tasks = new PostgresProviderTaskStore();
  const orchestrator = createDataForSeoOrchestrator(tasks);
  // Validate before claiming tasks; mock mode never needs API credentials.
  if (process.env.DATAFORSEO_MOCK === "false") {
    const { DataForSeoClient } = await import("../src/lib/backend/dataforseo/client");
    new DataForSeoClient().assertReady();
  }
  const store = await getPromptStore();
  const worker = new DataForSeoQueueWorker(new RecoveryWorker(tasks, orchestrator), new SubmitWorker(tasks, orchestrator), new StaleTaskSweeper(tasks));
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(`DataForSEO local worker: ${process.env.DATAFORSEO_MOCK === "true" ? "MOCK (no provider calls)" : "LIVE (billable provider calls)"}`);
  try {
    do {
      const result = await worker.runOnce({
        owner: `local-${randomUUID()}`,
        submitBatchSize: positive(process.env.DATAFORSEO_SUBMIT_BATCH_SIZE, 20, 20),
        recoveryBatchSize: positive(process.env.DATAFORSEO_RECOVERY_BATCH_SIZE, 40, 100),
        maxInFlight: positive(process.env.DATAFORSEO_MAX_IN_FLIGHT, 20, 100),
        leaseMs: 120_000,
        staleSubmissionAfterMs: Math.max(60, positive(process.env.DATAFORSEO_SUBMISSION_STALE_SECONDS, 300, 3600)) * 1000,
      });
      if (result.submission.claimed || result.recovery.claimed || result.stale.tasks.length) console.log(JSON.stringify(result));
      if (process.argv.includes("--once")) break;
      await delay(positive(process.env.DATAFORSEO_LOCAL_INTERVAL_MS, 5000, 60000), undefined, { signal: shutdown.signal }).catch((error) => {
        if (!shutdown.signal.aborted) throw error;
      });
    } while (!shutdown.signal.aborted);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await store.close();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
