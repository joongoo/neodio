import type { ProviderTaskStore } from "./taskStore";
import type { ProviderTaskRecord } from "./types";

export interface ProviderTaskSubmitter {
  submit(id: string, leaseOwner?: string): Promise<ProviderTaskRecord>;
}

export interface RunSubmitWorkerInput {
  owner: string;
  batchSize: number;
  maxInFlight: number;
  leaseMs: number;
  organizationId?: string;
  now?: string;
}

export interface SubmitWorkerResult {
  claimed: number;
  tasks: ProviderTaskRecord[];
  errors: Array<{ taskId: string; message: string }>;
}

/** 한 번 선점한 task는 각각 한 번만 submit하며, 실패 task를 이 실행 안에서 재시도하지 않는다. */
export class SubmitWorker {
  constructor(
    private readonly taskStore: ProviderTaskStore,
    private readonly submitter: ProviderTaskSubmitter,
  ) {}

  async runOnce(input: RunSubmitWorkerInput): Promise<SubmitWorkerResult> {
    const claimed = await this.taskStore.claimReserved({
      owner: input.owner,
      limit: input.batchSize,
      maxInFlight: input.maxInFlight,
      leaseMs: input.leaseMs,
      organizationId: input.organizationId,
      now: input.now,
    });
    const settled = await Promise.all(claimed.map(async (task) => {
      try {
        return { task: await this.submitter.submit(task.id, input.owner), error: null };
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
