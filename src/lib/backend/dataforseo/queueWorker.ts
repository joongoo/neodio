import type { RecoveryWorkerResult, RunRecoveryWorkerInput } from "./recoveryWorker";
import type { RunSubmitWorkerInput, SubmitWorkerResult } from "./submitWorker";
import type { RunStaleTaskSweeperInput, StaleTaskSweeperResult } from "./staleTaskSweeper";

export interface DataForSeoSubmitWorker {
  runOnce(input: RunSubmitWorkerInput): Promise<SubmitWorkerResult>;
}

export interface DataForSeoRecoveryWorker {
  runOnce(input: RunRecoveryWorkerInput): Promise<RecoveryWorkerResult>;
}

export interface RunDataForSeoQueueInput {
  owner: string;
  submitBatchSize: number;
  recoveryBatchSize: number;
  maxInFlight: number;
  leaseMs: number;
  staleSubmissionAfterMs: number;
}

export interface DataForSeoQueueResult {
  stale: StaleTaskSweeperResult;
  recovery: RecoveryWorkerResult;
  submission: SubmitWorkerResult;
}

export interface DataForSeoStaleTaskSweeper {
  runOnce(input: RunStaleTaskSweeperInput): Promise<StaleTaskSweeperResult>;
}

/** 완료 결과를 먼저 회수해 빈 슬롯을 만든 뒤, 승인 범위 안의 미제출 작업을 채운다. */
export class DataForSeoQueueWorker {
  constructor(
    private readonly recoveryWorker: DataForSeoRecoveryWorker,
    private readonly submitWorker: DataForSeoSubmitWorker,
    private readonly staleTaskSweeper: DataForSeoStaleTaskSweeper,
  ) {}

  async runOnce(input: RunDataForSeoQueueInput): Promise<DataForSeoQueueResult> {
    const stale = await this.staleTaskSweeper.runOnce({
      limit: input.recoveryBatchSize,
      staleAfterMs: input.staleSubmissionAfterMs,
    });
    const recovery = await this.recoveryWorker.runOnce({
      owner: `${input.owner}:recovery`,
      batchSize: input.recoveryBatchSize,
      leaseMs: input.leaseMs,
    });
    const submission = await this.submitWorker.runOnce({
      owner: `${input.owner}:submit`,
      batchSize: input.submitBatchSize,
      maxInFlight: input.maxInFlight,
      leaseMs: input.leaseMs,
    });
    return { stale, recovery, submission };
  }
}
