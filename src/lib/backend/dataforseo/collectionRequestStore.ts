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

export interface CollectionRequestSummary extends CollectionRequestRecord {
  waitingCount: number;
  runningCount: number;
  completedCount: number;
  attentionCount: number;
  failedCount: number;
  cancelledCount: number;
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
  listRecentSummaries(organizationId: string, brandId: string | null, limit?: number): Promise<CollectionRequestSummary[]>;
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

function rowToSummary(row: Record<string, unknown>): CollectionRequestSummary {
  return {
    ...rowToRequest(row),
    actualCostUsd: Number(row.task_actual_cost_usd ?? row.actual_cost_usd),
    waitingCount: Number(row.waiting_count),
    runningCount: Number(row.running_count),
    completedCount: Number(row.completed_count),
    attentionCount: Number(row.attention_count),
    failedCount: Number(row.failed_count),
    cancelledCount: Number(row.cancelled_count),
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

  async listRecentSummaries(organizationId: string, brandId: string | null, limit = 5): Promise<CollectionRequestSummary[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("요청 조회 limit은 1~20이어야 합니다.");
    const rows = await (await getPromptStore()).query<Record<string, unknown>>(
      `SELECT r.*,
         COALESCE(sum(t.actual_cost_usd),0) AS task_actual_cost_usd,
         count(t.id) FILTER (WHERE t.status='reserved')::int AS waiting_count,
         count(t.id) FILTER (WHERE t.status IN ('submitting','queued','collecting','raw_saved','normalized','artifact_failed','projection_failed'))::int AS running_count,
         count(t.id) FILTER (WHERE t.status='completed')::int AS completed_count,
         count(t.id) FILTER (WHERE t.status='submission_unknown')::int AS attention_count,
         count(t.id) FILTER (WHERE t.status IN ('provider_failed','parse_failed'))::int AS failed_count,
         count(t.id) FILTER (WHERE t.status='cancelled')::int AS cancelled_count
       FROM collection_requests r
       LEFT JOIN provider_tasks t ON t.collection_request_id=r.id
       WHERE r.organization_id=$1 AND r.brand_id IS NOT DISTINCT FROM $2
       GROUP BY r.id
       ORDER BY r.created_at DESC,r.id DESC
       LIMIT $3`,
      [organizationId, brandId, limit],
    );
    return rows.map(rowToSummary);
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

  async listRecentSummaries(organizationId: string, brandId: string | null, limit = 5): Promise<CollectionRequestSummary[]> {
    return [...this.requests.values()]
      .filter((request) => request.organizationId === organizationId && request.brandId === brandId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, limit)
      .map((request) => ({
        ...request, waitingCount: request.totalTaskCount, runningCount: 0, completedCount: 0,
        attentionCount: 0, failedCount: 0, cancelledCount: 0,
      }));
  }
}
