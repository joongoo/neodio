import type { ProviderTaskStore } from "./taskStore";
import type { ProviderTaskRecord } from "./types";

export interface RunStaleTaskSweeperInput {
  limit: number;
  staleAfterMs: number;
  now?: string;
}

export interface StaleTaskSweeperResult {
  quarantined: number;
  tasks: ProviderTaskRecord[];
}

/** Provider POST 결과를 증명할 수 없는 오래된 submitting task를 재제출하지 않고 확인 대상으로 격리한다. */
export class StaleTaskSweeper {
  constructor(private readonly taskStore: ProviderTaskStore) {}

  async runOnce(input: RunStaleTaskSweeperInput): Promise<StaleTaskSweeperResult> {
    const tasks = await this.taskStore.quarantineStaleSubmissions(input);
    return { quarantined: tasks.length, tasks };
  }
}
