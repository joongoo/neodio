import { randomUUID } from "node:crypto";
import { getPromptStore } from "@/lib/backend/database";

export type CollectionRequestKind = "manual" | "scheduled" | "retry";
export type CollectionRequestStatus = "queued" | "running" | "completed" | "partially_failed" | "needs_attention" | "cancelled";

export interface CollectionRequestRecord {
  id: string;
  organizationId: string;
  brandId: string | null;
  requestedBy: string | null;
  requestKind: CollectionRequestKind;
  status: CollectionRequestStatus;
  totalTaskCount: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  cancelRequested: boolean;
  retryOfRequestId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string;
  completedAt: string | null;
}

export interface CreateCollectionRequestInput {
  organizationId: string;
  brandId?: string | null;
  requestedBy?: string | null;
  requestKind: CollectionRequestKind;
  totalTaskCount: number;
  estimatedCostUsd: number;
  retryOfRequestId?: string | null;
  approvedAt?: string;
}

export interface CollectionRequestStore {
  create(input: CreateCollectionRequestInput): Promise<CollectionRequestRecord>;
  get(id: string): Promise<CollectionRequestRecord | null>;
}

function rowToRequest(row: Record<string, unknown>): CollectionRequestRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    brandId: row.brand_id as string | null,
    requestedBy: row.requested_by as string | null,
    requestKind: row.request_kind as CollectionRequestKind,
    status: row.status as CollectionRequestStatus,
    totalTaskCount: Number(row.total_task_count),
    estimatedCostUsd: Number(row.estimated_cost_usd),
    actualCostUsd: Number(row.actual_cost_usd),
    cancelRequested: row.cancel_requested === true,
    retryOfRequestId: row.retry_of_request_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    approvedAt: row.approved_at as string,
    completedAt: row.completed_at as string | null,
  };
}

export class PostgresCollectionRequestStore implements CollectionRequestStore {
  async create(input: CreateCollectionRequestInput): Promise<CollectionRequestRecord> {
    if (!Number.isInteger(input.totalTaskCount) || input.totalTaskCount < 1) {
      throw new Error("수집 요청에는 하나 이상의 task가 필요합니다.");
    }
    if (!Number.isFinite(input.estimatedCostUsd) || input.estimatedCostUsd < 0) {
      throw new Error("수집 요청 예상 비용이 올바르지 않습니다.");
    }
    const id = `creq-${randomUUID()}`;
    const now = new Date().toISOString();
    const [row] = await (await getPromptStore()).query<Record<string, unknown>>(
      `INSERT INTO collection_requests (
         id,organization_id,brand_id,requested_by,request_kind,status,total_task_count,
         estimated_cost_usd,actual_cost_usd,cancel_requested,retry_of_request_id,
         created_at,updated_at,approved_at,completed_at
       ) VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,0,false,$8,$9,$9,$10,NULL)
       RETURNING *`,
      [id, input.organizationId, input.brandId ?? null, input.requestedBy ?? null, input.requestKind,
        input.totalTaskCount, input.estimatedCostUsd, input.retryOfRequestId ?? null, now, input.approvedAt ?? now],
    );
    return rowToRequest(row);
  }

  async get(id: string): Promise<CollectionRequestRecord | null> {
    const [row] = await (await getPromptStore()).query<Record<string, unknown>>(
      "SELECT * FROM collection_requests WHERE id=$1",
      [id],
    );
    return row ? rowToRequest(row) : null;
  }
}

export class MemoryCollectionRequestStore implements CollectionRequestStore {
  readonly requests = new Map<string, CollectionRequestRecord>();

  async create(input: CreateCollectionRequestInput): Promise<CollectionRequestRecord> {
    if (!Number.isInteger(input.totalTaskCount) || input.totalTaskCount < 1) {
      throw new Error("수집 요청에는 하나 이상의 task가 필요합니다.");
    }
    if (!Number.isFinite(input.estimatedCostUsd) || input.estimatedCostUsd < 0) {
      throw new Error("수집 요청 예상 비용이 올바르지 않습니다.");
    }
    const now = new Date().toISOString();
    const request: CollectionRequestRecord = {
      id: `creq-${randomUUID()}`,
      organizationId: input.organizationId,
      brandId: input.brandId ?? null,
      requestedBy: input.requestedBy ?? null,
      requestKind: input.requestKind,
      status: "queued",
      totalTaskCount: input.totalTaskCount,
      estimatedCostUsd: input.estimatedCostUsd,
      actualCostUsd: 0,
      cancelRequested: false,
      retryOfRequestId: input.retryOfRequestId ?? null,
      createdAt: now,
      updatedAt: now,
      approvedAt: input.approvedAt ?? now,
      completedAt: null,
    };
    this.requests.set(request.id, request);
    return request;
  }

  async get(id: string): Promise<CollectionRequestRecord | null> {
    return this.requests.get(id) ?? null;
  }
}
