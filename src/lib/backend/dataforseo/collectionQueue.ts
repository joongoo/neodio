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

export interface AppendApprovedCollectionInput extends EnqueueApprovedCollectionInput {
  clientRequestId: string;
  reuseActive: boolean;
}

export interface AppendedCollection {
  request: CollectionRequestRecord | null;
  reservations: Array<{ task: ProviderTaskRecord; created: boolean }>;
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

  async appendApproved(input: AppendApprovedCollectionInput): Promise<AppendedCollection> {
    if (input.tasks.length === 0) throw new Error("수집 요청에는 하나 이상의 task가 필요합니다.");
    if (!input.clientRequestId.trim()) throw new Error("사용자 수집 실행 ID가 필요합니다.");

    return this.transaction(async () => {
      await this.requests.lockClientRequest(input.organizationId, input.clientRequestId);
      let request = await this.requests.getByClientRequestId(input.organizationId, input.clientRequestId);
      if (request && (request.brandId !== (input.brandId ?? null) || request.requestKind !== input.requestKind)) {
        throw new Error("사용자 수집 실행 ID의 대상이 기존 요청과 일치하지 않습니다.");
      }

      const planned = input.tasks.map(task => ({ ...task, organizationId: input.organizationId, brandId: input.brandId, collectionRequestId: null }));
      let reservations: AppendedCollection["reservations"] = [];
      if (!input.reuseActive) {
        // Explicit retries already validate each original; bulk insert avoids N DB round-trips.
        reservations = await this.providerTasks.reserveMany(planned);
      } else {
        for (const task of planned) reservations.push(await this.providerTasks.reserveActive(task));
      }
      const created = reservations.filter((item) => item.created);
      if (created.length === 0) return { request, reservations };

      const estimatedCostUsd = created.reduce((sum, item) => sum + item.task.estimatedCostUsd, 0);
      request = request
        ? await this.requests.addTasks(request.id, created.length, estimatedCostUsd)
        : await this.requests.create({
            organizationId: input.organizationId,
            brandId: input.brandId,
            requestedBy: input.requestedBy,
            clientRequestId: input.clientRequestId,
            requestKind: input.requestKind,
            totalTaskCount: created.length,
            estimatedCostUsd,
            retryOfRequestId: input.retryOfRequestId,
          });
      const attached = await this.providerTasks.attachToCollectionRequest(created.map((item) => item.task.id), request.id);
      const attachedById = new Map(attached.map((task) => [task.id, task]));
      return {
        request,
        reservations: reservations.map((item) => item.created
          ? { ...item, task: attachedById.get(item.task.id) ?? item.task }
          : item),
      };
    });
  }
}
