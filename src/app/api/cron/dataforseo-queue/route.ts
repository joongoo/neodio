import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createDataForSeoOrchestrator } from "@/lib/backend/dataforseo";
import { DataForSeoQueueWorker } from "@/lib/backend/dataforseo/queueWorker";
import { RecoveryWorker } from "@/lib/backend/dataforseo/recoveryWorker";
import { SubmitWorker } from "@/lib/backend/dataforseo/submitWorker";
import { StaleTaskSweeper } from "@/lib/backend/dataforseo/staleTaskSweeper";
import { PostgresProviderTaskStore } from "@/lib/backend/dataforseo/taskStore";

export const runtime = "nodejs";
export const maxDuration = 60;

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return NextResponse.json({ error: "DataForSEO credentials are not configured" }, { status: 503 });
  }
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN && !(process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    return NextResponse.json({ error: "DataForSEO artifact storage is not configured" }, { status: 503 });
  }

  const taskStore = new PostgresProviderTaskStore();
  const orchestrator = createDataForSeoOrchestrator(taskStore);
  const worker = new DataForSeoQueueWorker(
    new RecoveryWorker(taskStore, orchestrator),
    new SubmitWorker(taskStore, orchestrator),
    new StaleTaskSweeper(taskStore),
  );
  const result = await worker.runOnce({
    owner: `vercel-${process.env.VERCEL_REGION ?? "local"}-${randomUUID()}`,
    submitBatchSize: positiveInteger(process.env.DATAFORSEO_SUBMIT_BATCH_SIZE, 30, 30),
    recoveryBatchSize: positiveInteger(process.env.DATAFORSEO_RECOVERY_BATCH_SIZE, 40, 100),
    maxInFlight: positiveInteger(process.env.DATAFORSEO_MAX_IN_FLIGHT, 30, 30),
    leaseMs: 120_000,
    staleSubmissionAfterMs: Math.max(60, positiveInteger(process.env.DATAFORSEO_SUBMISSION_STALE_SECONDS, 300, 3_600)) * 1_000,
  });

  return NextResponse.json(result);
}
