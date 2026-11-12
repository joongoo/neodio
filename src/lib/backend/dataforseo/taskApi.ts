import type { ProviderTaskRecord, ProviderTaskStatus } from "./types";

export const RECOVERABLE_PROVIDER_STATUSES = new Set<ProviderTaskStatus>([
  "queued",
  "collecting",
  "artifact_failed",
  "projection_failed",
]);

export const TERMINAL_PROVIDER_STATUSES = new Set<ProviderTaskStatus>([
  "completed",
  "submission_unknown",
  "provider_failed",
  "parse_failed",
  "cancelled",
]);

export function publicProviderTask(task: ProviderTaskRecord) {
  return {
    id: task.id,
    status: task.status,
    estimatedCostUsd: task.estimatedCostUsd,
    actualCostUsd: task.actualCostUsd,
    errorCode: task.errorCode,
    errorMessage: task.errorMessage,
  };
}
