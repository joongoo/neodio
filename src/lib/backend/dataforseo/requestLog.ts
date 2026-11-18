import { getPromptStore } from "@/lib/backend/database";
import { PROMPT_SURFACES } from "@/lib/promptSurfaces";
import type { CollectionRequestDisplayStatus } from "@/lib/collectionRequestProgress";
import { COLLECTION_ATTENTION_STATUSES } from "@/lib/collectionAttention";
import { WITHOUT_COLLECTION_RETRY_SQL } from "./collectionActivity";

export class RequestLogInputError extends Error {}

export function parseRequestLogOptions(params: URLSearchParams) {
  const integer = (key: string, fallback: number) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) throw new RequestLogInputError(`${key} 값이 올바르지 않습니다.`);
    return Number(raw);
  };
  const page = integer("page", 1);
  const size = integer("size", 25);
  if (![10, 25, 50].includes(size)) throw new RequestLogInputError("size는 10, 25, 50 중 하나여야 합니다.");
  const status = params.get("status");
  const attention = params.get("attention");
  if (attention !== null && attention !== "1") throw new RequestLogInputError("attention 값이 올바르지 않습니다.");
  if (status && !["queued", "running", "completed", "partially_failed", "needs_attention", "cancelled"].includes(status)) throw new RequestLogInputError("status 값이 올바르지 않습니다.");
  const surface = params.get("surface");
  if (surface && !(PROMPT_SURFACES as readonly string[]).includes(surface)) throw new RequestLogInputError("surface 값이 올바르지 않습니다.");
  const sort = params.get("sort") ?? "newest";
  if (!["newest", "oldest"].includes(sort)) throw new RequestLogInputError("sort 값이 올바르지 않습니다.");
  const date = (key: string) => {
    const raw = params.get(key);
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw new RequestLogInputError(`${key}는 시간대가 있는 ISO 날짜여야 합니다.`);
    return new Date(raw).toISOString();
  };
  const from = date("from"), to = date("to");
  if (from && to && from >= to) throw new RequestLogInputError("from은 to보다 이전이어야 합니다.");
  return { page, size, status, surface, sort, from, to, attention: attention === "1", q: (params.get("q") ?? "").trim() };
}

export interface RequestLogRow {
  id: string;
  clientRequestId: string | null;
  requestKind: string;
  requestedBy: { id: string; name: string | null } | null;
  createdAt: string;
  approvedAt: string;
  completedAt: string | null;
  status: CollectionRequestDisplayStatus;
  surfaces: string[];
  devices: string[];
  counts: { total: number; waiting: number; running: number; completed: number; failed: number; attention: number; cancelled: number };
  estimatedCostUsd: number;
  actualCostUsd: number;
  cancelRequested: boolean;
  retryOfRequestId: string | null;
}

interface RequestLogPage { rows: RequestLogRow[]; filteredTotal: number; page: number; pageSize: number; pageCount: number }
export interface RequestLogDatabase { query<T>(sql: string, params: unknown[]): Promise<T[]> }

/** One SQL statement keeps count, clamped page and summaries on one snapshot. */
export async function listRequestLogs(
  organizationId: string,
  brandId: string,
  options: ReturnType<typeof parseRequestLogOptions>,
  database?: RequestLogDatabase,
  requestId?: string,
  retryOfRequestId?: string,
): Promise<RequestLogPage> {
  const db = database ?? await getPromptStore();
  const direction = options.sort === "oldest" ? "ASC" : "DESC";
  const [result] = await db.query<{ payload: RequestLogPage }>(`
    WITH scoped AS (
      SELECT r.*, u.name AS requester_name FROM collection_requests r
      LEFT JOIN neodio_users u ON u.id=r.requested_by
      WHERE r.organization_id=$1 AND r.brand_id=$2
        AND ($10::text IS NULL OR r.id=$10)
        AND ($13::text IS NULL OR r.retry_of_request_id=$13)
        AND ($3::text IS NULL OR r.created_at >= $3)
        AND ($4::text IS NULL OR r.created_at < $4)
        AND (NOT $11::boolean OR EXISTS (
          SELECT 1 FROM collection_execution_items p WHERE p.collection_request_id=r.id
            AND p.organization_id=r.organization_id AND p.brand_id=r.brand_id
            AND p.status=ANY($12::text[])
            AND ${WITHOUT_COLLECTION_RETRY_SQL}
        ))
    ), aggregates AS (
      SELECT r.id, count(t.id)::int AS total,
        count(t.id) FILTER (WHERE t.status='reserved')::int AS waiting,
        count(t.id) FILTER (WHERE t.status IN ('submitting','queued','collecting','raw_saved','normalized','artifact_failed','projection_failed'))::int AS running,
        count(t.id) FILTER (WHERE t.status='completed')::int AS completed,
        count(t.id) FILTER (WHERE t.status IN ('provider_failed','parse_failed'))::int AS failed,
        count(t.id) FILTER (WHERE t.status='submission_unknown')::int AS attention,
        count(t.id) FILTER (WHERE t.status='cancelled')::int AS cancelled,
        COALESCE(sum(t.actual_cost_usd),0)::float8 AS actual_cost,
        COALESCE(array_agg(DISTINCT t.surface ORDER BY t.surface) FILTER (WHERE t.id IS NOT NULL),ARRAY[]::text[]) AS surfaces,
        COALESCE(array_agg(DISTINCT t.device ORDER BY t.device) FILTER (WHERE t.id IS NOT NULL),ARRAY[]::text[]) AS devices,
        CASE WHEN count(t.id)>0 AND bool_and(t.status IN ('completed','provider_failed','parse_failed','cancelled'))
          AND bool_and(t.completed_at IS NOT NULL) THEN max(t.completed_at) ELSE NULL END AS finished_at,
        COALESCE(bool_or(strpos(lower(t.query_snapshot),lower($5))>0),false) AS query_match
      FROM scoped r LEFT JOIN collection_execution_items t ON t.collection_request_id=r.id
        AND t.organization_id=r.organization_id AND t.brand_id=r.brand_id
      GROUP BY r.id
    ), summaries AS (
      SELECT r.*, a.total,a.waiting,a.running,a.completed,a.failed,a.attention,a.cancelled,a.actual_cost,a.surfaces,a.devices,a.finished_at,a.query_match,
        CASE WHEN a.attention>0 THEN 'needs_attention'
          WHEN a.total>0 AND a.completed+a.failed+a.cancelled>=a.total THEN
            CASE WHEN a.failed>0 THEN 'partially_failed' WHEN a.cancelled=a.total THEN 'cancelled' ELSE 'completed' END
          WHEN a.running>0 THEN 'running' ELSE 'queued' END AS display_status
      FROM scoped r JOIN aggregates a ON a.id=r.id
    ), filtered AS (
      SELECT * FROM summaries WHERE ($6::text IS NULL OR display_status=$6)
        AND ($7::text IS NULL OR $7=ANY(surfaces))
        AND ($5='' OR strpos(lower(id),lower($5))>0 OR strpos(lower(COALESCE(client_request_id,'')),lower($5))>0 OR query_match)
    ), pagination AS (
      SELECT count(*)::int AS total, GREATEST(1,ceil(count(*)::numeric/$8)::int) AS pages FROM filtered
    ), bounds AS (
      SELECT *, LEAST($9::int,pages) AS current_page FROM pagination
    ), paged AS (
      SELECT * FROM filtered ORDER BY created_at ${direction},id ${direction}
      LIMIT $8 OFFSET (SELECT (current_page-1)*$8 FROM bounds)
    )
    SELECT jsonb_build_object('filteredTotal',b.total,'page',b.current_page,'pageSize',$8::int,'pageCount',b.pages,
      'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'clientRequestId',p.client_request_id,'requestKind',p.request_kind,
        'requestedBy',CASE WHEN p.requested_by IS NULL THEN NULL ELSE jsonb_build_object('id',p.requested_by,'name',p.requester_name) END,
        'createdAt',p.created_at,'approvedAt',p.approved_at,'completedAt',p.finished_at,'status',p.display_status,
        'surfaces',p.surfaces,'devices',p.devices,
        'counts',jsonb_build_object('total',p.total,'waiting',p.waiting,'running',p.running,'completed',p.completed,'failed',p.failed,'attention',p.attention,'cancelled',p.cancelled),
        'estimatedCostUsd',p.estimated_cost_usd::float8,'actualCostUsd',p.actual_cost,
        'cancelRequested',p.cancel_requested,'retryOfRequestId',p.retry_of_request_id
      ) ORDER BY p.created_at ${direction},p.id ${direction}) FROM paged p),'[]'::jsonb)) AS payload
    FROM bounds b
  `,
  [organizationId, brandId, options.from, options.to, options.q, options.status, options.surface, options.size, options.page, requestId ?? null, options.attention, COLLECTION_ATTENTION_STATUSES, retryOfRequestId ?? null]);
  return result.payload;
}

export async function getRequestLog(organizationId: string, brandId: string, requestId: string, database?: RequestLogDatabase): Promise<RequestLogRow | null> {
  const page = await listRequestLogs(organizationId, brandId, parseRequestLogOptions(new URLSearchParams()), database, requestId);
  return page.rows[0] ?? null;
}
