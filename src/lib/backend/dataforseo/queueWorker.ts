import type { RecoveryWorkerResult, RunRecoveryWorkerInput } from "./recoveryWorker";
import type { RunSubmitWorkerInput, SubmitWorkerResult } from "./submitWorker";

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
}

export interface DataForSeoQueueResult {
  recovery: RecoveryWorkerResult;
  submission: SubmitWorkerResult;
}

/** 완료 결과를 먼저 회수해 빈 슬롯을 만든 뒤, 승인 범위 안의 미제출 작업을 채운다. */
export class DataForSeoQueueWorker {
  constructor(
    private readonly recoveryWorker: DataForSeoRecoveryWorker,
    private readonly submitWorker: DataForSeoSubmitWorker,
  ) {}

  async runOnce(input: RunDataForSeoQueueInput): Promise<DataForSeoQueueResult> {
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
    return { recovery, submission };
  }
}
