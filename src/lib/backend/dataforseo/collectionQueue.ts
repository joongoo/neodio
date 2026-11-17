import { getPromptStore } from "@/lib/backend/database";
import { DATAFORSEO_SURFACE_CONFIG } from "./config";
import {
  PostgresCollectionRequestStore,
  type CollectionRequestKind,
  type CollectionRequestRecord,
  type CollectionRequestStore,
} from "./collectionRequestStore";
import {
  PostgresProviderTaskStore,
  type ProviderTaskStore,
  type ReserveProviderTaskInput,
} from "./taskStore";
import type { ProviderTaskRecord } from "./types";

export type ApprovedCollectionTaskInput = Omit<
  ReserveProviderTaskInput,
  "organizationId" | "brandId" | "collectionRequestId"
>;

export interface EnqueueApprovedCollectionInput {
  organizationId: string;
  brandId?: string | null;
  requestedBy?: string | null;
  clientRequestId?: string | null;
  requestKind: CollectionRequestKind;
  retryOfRequestId?: string | null;
  tasks: ApprovedCollectionTaskInput[];
}

export interface EnqueuedCollection {
  request: CollectionRequestRecord;
  tasks: ProviderTaskRecord[];
}

export type TransactionRunner = <T>(work: () => Promise<T>) => Promise<T>;

const postgresTransaction: TransactionRunner = async <T>(work: () => Promise<T>) =>
  (await getPromptStore()).transaction(work);

/**
 * 비용 승인이 끝난 요청과 최초 Provider task를 같은 트랜잭션에 저장한다.
 * 이 서비스는 아직 HTTP route에 연결하지 않는다. 요청 생성과 task bulk insert가 모두 성공해야 commit된다.
 */
export class CollectionQueueService {
  constructor(
    private readonly requests: CollectionRequestStore = new PostgresCollectionRequestStore(),
    private readonly providerTasks: ProviderTaskStore = new PostgresProviderTaskStore(),
    private readonly transaction: TransactionRunner = postgresTransaction,
  ) {}

  async enqueueApproved(input: EnqueueApprovedCollectionInput): Promise<EnqueuedCollection> {
    if (input.tasks.length === 0) throw new Error("수집 요청에는 하나 이상의 task가 필요합니다.");
    const estimatedCostUsd = input.tasks.reduce(
      (sum, task) => sum + DATAFORSEO_SURFACE_CONFIG[task.surface].estimatedCostUsd,
      0,
    );

    return this.transaction(async () => {
      const request = await this.requests.create({
        organizationId: input.organizationId,
        brandId: input.brandId,
        requestedBy: input.requestedBy,
        clientRequestId: input.clientRequestId,
        requestKind: input.requestKind,
        totalTaskCount: input.tasks.length,
        estimatedCostUsd,
        retryOfRequestId: input.retryOfRequestId,
      });
      const reserved = await this.providerTasks.reserveMany(
        input.tasks.map((taskInput) => ({
          ...taskInput,
          organizationId: input.organizationId,
          brandId: input.brandId,
          collectionRequestId: request.id,
        })),
      );
      if (reserved.some((item) => !item.created || item.task.collectionRequestId !== request.id)) {
          throw new Error("이미 예약된 Provider task가 포함되어 수집 요청을 만들지 않았습니다.");
      }
      const tasks: ProviderTaskRecord[] = reserved.map((item) => item.task);
      return { request, tasks };
    });
  }
}
