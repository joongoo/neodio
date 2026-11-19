import type { ProviderTaskStore } from "./taskStore";
import type { NormalizedAiObservation, ProviderTaskRecord } from "./types";

export interface ProviderTaskRecoverer {
  recover(id: string, leaseOwner?: string): Promise<{
    task: ProviderTaskRecord;
    observation: NormalizedAiObservation | null;
  }>;
}

export interface RunRecoveryWorkerInput {
  owner: string;
  batchSize: number;
  leaseMs: number;
  organizationId?: string;
  now?: string;
}

export interface RecoveryWorkerResult {
  claimed: number;
  tasks: ProviderTaskRecord[];
  errors: Array<{ taskId: string; message: string }>;
}

/** 조회 시각이 된 task만 선점해 결과를 회수한다. 실패해도 Provider 제출을 다시 만들지 않는다. */
export class RecoveryWorker {
  constructor(
    private readonly taskStore: ProviderTaskStore,
    private readonly recoverer: ProviderTaskRecoverer,
  ) {}

  async runOnce(input: RunRecoveryWorkerInput): Promise<RecoveryWorkerResult> {
    const claimed = await this.taskStore.claimRecoverable({
      owner: input.owner,
      limit: input.batchSize,
      leaseMs: input.leaseMs,
      organizationId: input.organizationId,
      now: input.now,
    });
    const settled = await Promise.all(claimed.map(async (task) => {
      try {
        const recovered = await this.recoverer.recover(task.id, input.owner);
        return { task: recovered.task, error: null };
      } catch (error) {
        return {
          task: null,
          error: { taskId: task.id, message: error instanceof Error ? error.message : String(error) },
        };
      }
    }));
    return {
      claimed: claimed.length,
      tasks: settled.flatMap((item) => item.task ? [item.task] : []),
      errors: settled.flatMap((item) => item.error ? [item.error] : []),
    };
  }
}
