import { createHash, randomUUID } from "node:crypto";
import { getPromptStore } from "@/lib/backend/database";
import { DATAFORSEO_SURFACE_CONFIG } from "./config";
import { COLLECTION_ATTENTION_STATUSES } from "@/lib/collectionAttention";
import { getCollectionActivitySummary } from "./collectionActivity";
import type {
  DataForSeoDevice,
  DataForSeoSurface,
  ProviderArtifactRecord,
  ProviderTaskRecord,
  ProviderTaskStatus,
} from "./types";

export interface ReserveProviderTaskInput {
  organizationId: string;
  brandId?: string | null;
  promptId?: string | null;
  collectionRequestId?: string | null;
  retryOfTaskId?: string | null;
  query: string;
  surface: DataForSeoSurface;
  device: DataForSeoDevice;
  marketId: string;
  scheduledWindow: string;
}

export interface ProviderTaskPatch {
  status: ProviderTaskStatus;
  providerTaskId?: string | null;
  actualCostUsd?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  normalizerVersion?: string | null;
  submissionAttemptedAt?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  nextPollAt?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface ClaimReservedProviderTasksInput {
  owner: string;
  limit: number;
  leaseMs: number;
  maxInFlight: number;
  organizationId?: string;
  now?: string;
}

export interface ClaimRecoverableProviderTasksInput {
  owner: string;
  limit: number;
  leaseMs: number;
  organizationId?: string;
  now?: string;
}

export interface ProviderTaskActivitySummary {
  runningCount: number;
  attentionCount: number;
}

export interface ProviderTaskStore {
  reserve(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }>;
  reserveActive(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }>;
  reserveMany(inputs: ReserveProviderTaskInput[]): Promise<Array<{ task: ProviderTaskRecord; created: boolean }>>;
  attachToCollectionRequest(ids: string[], collectionRequestId: string): Promise<ProviderTaskRecord[]>;
  quarantineStaleSubmissions(input: { limit: number; staleAfterMs: number; now?: string }): Promise<ProviderTaskRecord[]>;
  claimReserved(input: ClaimReservedProviderTasksInput): Promise<ProviderTaskRecord[]>;
  claimRecoverable(input: ClaimRecoverableProviderTasksInput): Promise<ProviderTaskRecord[]>;
  beginSubmission(id: string, owner: string, attemptedAt: string): Promise<ProviderTaskRecord | null>;
  get(id: string): Promise<ProviderTaskRecord | null>;
  getMany(ids: string[]): Promise<ProviderTaskRecord[]>;
  getActivitySummary(organizationId: string, brandId: string): Promise<ProviderTaskActivitySummary>;
  update(id: string, expected: ProviderTaskStatus | ProviderTaskStatus[], patch: ProviderTaskPatch): Promise<ProviderTaskRecord>;
  saveArtifact(artifact: ProviderArtifactRecord): Promise<void>;
}

const ACTIVE_PROVIDER_STATUSES: ProviderTaskStatus[] = [
  "reserved",
  "submitting",
  "queued",
  "collecting",
  "raw_saved",
  "normalized",
  "artifact_failed",
  "projection_failed",
];

const IN_FLIGHT_PROVIDER_STATUSES: ProviderTaskStatus[] = [
  "submitting",
  "submission_unknown",
  "queued",
  "collecting",
  "raw_saved",
  "normalized",
  "artifact_failed",
  "projection_failed",
];

const RECOVERABLE_PROVIDER_STATUSES: ProviderTaskStatus[] = [
  "queued",
  "collecting",
  "artifact_failed",
  "projection_failed",
];

function dedupeKey(input: ReserveProviderTaskInput): string {
  return createHash("sha256").update([
    input.organizationId,
    input.brandId ?? "",
    input.promptId ?? "",
    input.query.trim(),
    input.surface,
    input.device,
    input.marketId,
    input.scheduledWindow,
  ].join("\u001f")).digest("hex");
}

function activeIdentityKey(input: ReserveProviderTaskInput): string {
  return [
    input.organizationId,
    input.brandId ?? "",
    input.promptId ?? "",
    input.query.trim(),
    input.surface,
    input.device,
    input.marketId,
  ].join("\u001f");
}

function sameActiveIdentity(task: ProviderTaskRecord, input: ReserveProviderTaskInput): boolean {
  return task.organizationId === input.organizationId
    && task.brandId === (input.brandId ?? null)
    && task.promptId === (input.promptId ?? null)
    && task.querySnapshot === input.query.trim()
    && task.surface === input.surface
    && task.device === input.device
    && task.marketId === input.marketId
    && ACTIVE_PROVIDER_STATUSES.includes(task.status);
}

function rowToTask(row: Record<string, unknown>): ProviderTaskRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    brandId: row.brand_id as string | null,
    promptId: row.prompt_id as string | null,
    collectionRequestId: row.collection_request_id as string | null,
    retryOfTaskId: row.retry_of_task_id as string | null,
    provider: "dataforseo",
    surface: row.surface as DataForSeoSurface,
    device: row.device as DataForSeoDevice,
    marketId: row.market_id as string,
    querySnapshot: row.query_snapshot as string,
    scheduledWindow: row.scheduled_window as string,
    dedupeKey: row.dedupe_key as string,
    endpoint: row.endpoint as string,
    tag: row.tag as string,
    providerTaskId: row.provider_task_id as string | null,
    status: row.status as ProviderTaskStatus,
    attempt: Number(row.attempt),
    estimatedCostUsd: Number(row.estimated_cost_usd),
    actualCostUsd: Number(row.actual_cost_usd),
    errorCode: row.error_code as string | null,
    errorMessage: row.error_message as string | null,
    normalizerVersion: row.normalizer_version as string | null,
    submissionAttemptedAt: row.submission_attempted_at as string | null,
    leaseOwner: row.lease_owner as string | null,
    leaseExpiresAt: row.lease_expires_at as string | null,
    nextPollAt: row.next_poll_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    submittedAt: row.submitted_at as string | null,
    completedAt: row.completed_at as string | null,
  };
}

export class PostgresProviderTaskStore implements ProviderTaskStore {
  constructor(private readonly database: typeof getPromptStore = getPromptStore) {}
  async listActive(organizationId: string, brandId: string, options: { manualOnly?: boolean } = {}): Promise<ProviderTaskRecord[]> {
    const rows = await (await this.database()).query<Record<string, unknown>>(
      `SELECT * FROM provider_tasks
       WHERE organization_id=$1 AND brand_id=$2
         AND ($3::boolean = false OR scheduled_window LIKE 'manual:%')
         AND status = ANY($4)
       ORDER BY created_at,id`,
      [organizationId, brandId, options.manualOnly === true,
        ["reserved", "submitting", "queued", "collecting", "raw_saved", "normalized", "artifact_failed", "projection_failed"]],
    );
    return rows.map(rowToTask);
  }

  async deleteReserved(id: string, organizationId: string, brandId: string): Promise<boolean> {
    const rows = await (await this.database()).query<{ id: string }>(
      `DELETE FROM provider_tasks
       WHERE id=$1 AND organization_id=$2 AND brand_id=$3
         AND status='reserved' AND provider_task_id IS NULL
       RETURNING id`,
      [id, organizationId, brandId],
    );
    return rows.length === 1;
  }

  async reserveActive(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }> {
    const store = await this.database();
    return store.transaction(async () => {
      // 요청 ID가 달라도 같은 프롬프트·엔진·기기의 활성 작업은 하나만 둔다.
      // advisory lock으로 동시에 들어온 두 예약 요청도 같은 기존 작업을 보게 한다.
      await store.query("SELECT pg_advisory_xact_lock(hashtext($1))", [activeIdentityKey(input)]);
      const [active] = await store.query<Record<string, unknown>>(
        `SELECT * FROM provider_tasks
         WHERE organization_id=$1 AND brand_id IS NOT DISTINCT FROM $2 AND prompt_id IS NOT DISTINCT FROM $3
           AND query_snapshot=$4 AND surface=$5 AND device=$6 AND market_id=$7 AND status = ANY($8)
         ORDER BY created_at,id LIMIT 1`,
        [input.organizationId, input.brandId ?? null, input.promptId ?? null, input.query.trim(), input.surface,
          input.device, input.marketId, ACTIVE_PROVIDER_STATUSES],
      );
      if (active) return { task: rowToTask(active), created: false };
      return this.reserve(input);
    });
  }

  async reserve(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }> {
    const store = await this.database();
    const key = dedupeKey(input);
    const id = `ptask-${randomUUID()}`;
    const now = new Date().toISOString();
    const config = DATAFORSEO_SURFACE_CONFIG[input.surface];
    const tag = `neodio:${id}`;
    const inserted = await store.query<Record<string, unknown>>(
      `INSERT INTO provider_tasks (
         id,organization_id,brand_id,prompt_id,collection_request_id,retry_of_task_id,provider,surface,device,market_id,query_snapshot,scheduled_window,dedupe_key,
         endpoint,tag,provider_task_id,status,attempt,estimated_cost_usd,actual_cost_usd,error_code,error_message,
         normalizer_version,created_at,updated_at,submitted_at,completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'dataforseo',$7,$8,$9,$10,$11,$12,$13,$14,NULL,'reserved',1,$15,0,NULL,NULL,NULL,$16,$16,NULL,NULL)
       ON CONFLICT(dedupe_key) DO NOTHING RETURNING *`,
      [id, input.organizationId, input.brandId ?? null, input.promptId ?? null,
        input.collectionRequestId ?? null, input.retryOfTaskId ?? null, input.surface, input.device, input.marketId,
        input.query.trim(), input.scheduledWindow, key, config.postPath, tag, config.estimatedCostUsd, now],
    );
    if (inserted[0]) return { task: rowToTask(inserted[0]), created: true };
    const [existing] = await store.query<Record<string, unknown>>("SELECT * FROM provider_tasks WHERE dedupe_key=$1", [key]);
    if (!existing) throw new Error("Provider task 중복 예약을 조회하지 못했습니다.");
    return { task: rowToTask(existing), created: false };
  }

  async reserveMany(inputs: ReserveProviderTaskInput[]): Promise<Array<{ task: ProviderTaskRecord; created: boolean }>> {
    if (inputs.length === 0) return [];
    const keys = inputs.map(dedupeKey);
    if (new Set(keys).size !== keys.length) throw new Error("한 수집 요청에 중복된 Provider task가 포함되어 있습니다.");

    const store = await this.database();
    return store.transaction(async () => {
      const now = new Date().toISOString();
      const rows = inputs.map((input, index) => {
        const id = `ptask-${randomUUID()}`;
        const config = DATAFORSEO_SURFACE_CONFIG[input.surface];
        return {
          id,
          organization_id: input.organizationId,
          brand_id: input.brandId ?? null,
          prompt_id: input.promptId ?? null,
          collection_request_id: input.collectionRequestId ?? null,
          retry_of_task_id: input.retryOfTaskId ?? null,
          surface: input.surface,
          device: input.device,
          market_id: input.marketId,
          query_snapshot: input.query.trim(),
          scheduled_window: input.scheduledWindow,
          dedupe_key: keys[index],
          endpoint: config.postPath,
          tag: `neodio:${id}`,
          estimated_cost_usd: config.estimatedCostUsd,
          created_at: now,
        };
      });
      const inserted = await store.query<{ id: string }>(
        `INSERT INTO provider_tasks (
           id,organization_id,brand_id,prompt_id,collection_request_id,retry_of_task_id,provider,surface,device,market_id,
           query_snapshot,scheduled_window,dedupe_key,endpoint,tag,provider_task_id,status,attempt,
           estimated_cost_usd,actual_cost_usd,error_code,error_message,normalizer_version,
           created_at,updated_at,submitted_at,completed_at
         )
         SELECT id,organization_id,brand_id,prompt_id,collection_request_id,retry_of_task_id,'dataforseo',surface,device,market_id,
           query_snapshot,scheduled_window,dedupe_key,endpoint,tag,NULL,'reserved',1,
           estimated_cost_usd,0,NULL,NULL,NULL,created_at,created_at,NULL,NULL
         FROM jsonb_to_recordset($1::jsonb) AS input(
           id TEXT, organization_id TEXT, brand_id TEXT, prompt_id TEXT, collection_request_id TEXT, retry_of_task_id TEXT,
           surface TEXT, device TEXT, market_id TEXT, query_snapshot TEXT, scheduled_window TEXT, dedupe_key TEXT,
           endpoint TEXT, tag TEXT, estimated_cost_usd NUMERIC, created_at TEXT
         )
         ON CONFLICT(dedupe_key) DO NOTHING
         RETURNING id`,
        [JSON.stringify(rows)],
      );
      const stored = await store.query<Record<string, unknown>>(
        "SELECT * FROM provider_tasks WHERE dedupe_key = ANY($1::text[])",
        [keys],
      );
      const byKey = new Map(stored.map((row) => [row.dedupe_key as string, rowToTask(row)]));
      const insertedIds = new Set(inserted.map((row) => row.id));
      return keys.map((key) => {
        const task = byKey.get(key);
        if (!task) throw new Error("대량 예약한 Provider task를 조회하지 못했습니다.");
        return { task, created: insertedIds.has(task.id) };
      });
    });
  }

  async attachToCollectionRequest(ids: string[], collectionRequestId: string): Promise<ProviderTaskRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (await this.database()).query<Record<string, unknown>>(
      `UPDATE provider_tasks SET collection_request_id=$2,updated_at=$3
       WHERE id = ANY($1::text[]) AND collection_request_id IS NULL
       RETURNING *`,
      [ids, collectionRequestId, new Date().toISOString()],
    );
    if (rows.length !== ids.length) throw new Error("Provider task를 수집 요청에 모두 연결하지 못했습니다.");
    return rows.map(rowToTask);
  }

  async quarantineStaleSubmissions(input: { limit: number; staleAfterMs: number; now?: string }): Promise<ProviderTaskRecord[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("stale task limit은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.staleAfterMs) || input.staleAfterMs < 60_000) throw new Error("stale 기준은 1분 이상이어야 합니다.");
    const now = input.now ?? new Date().toISOString();
    const cutoff = new Date(Date.parse(now) - input.staleAfterMs).toISOString();
    const rows = await (await this.database()).query<Record<string, unknown>>(
      `WITH stale AS (
         SELECT id FROM provider_tasks
         WHERE status='submitting'
           AND COALESCE(submission_attempted_at,updated_at) <= $1
           AND (lease_expires_at IS NULL OR lease_expires_at <= $2)
         ORDER BY COALESCE(submission_attempted_at,updated_at),id
         FOR UPDATE SKIP LOCKED LIMIT $3
       )
       UPDATE provider_tasks p
       SET status='submission_unknown',error_code='submission_stale',
         error_message='Provider 제출 결과를 확인할 수 없어 자동 재제출하지 않습니다.',
         lease_owner=NULL,lease_expires_at=NULL,updated_at=$2
       FROM stale WHERE p.id=stale.id RETURNING p.*`,
      [cutoff, now, input.limit],
    );
    return rows.map(rowToTask);
  }

  async claimReserved(input: ClaimReservedProviderTasksInput): Promise<ProviderTaskRecord[]> {
    if (!input.owner.trim()) throw new Error("worker owner가 필요합니다.");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("선점 limit은 1 이상이어야 합니다.");
    if (!Number.isInteger(input.maxInFlight) || input.maxInFlight < 1) throw new Error("전역 in-flight 상한은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1_000) throw new Error("lease는 1초 이상이어야 합니다.");

    const store = await this.database();
    return store.transaction(async () => {
      const now = input.now ?? new Date().toISOString();
      const leaseExpiresAt = new Date(Date.parse(now) + input.leaseMs).toISOString();
      // 전역 슬롯 계산과 reserved 선점을 직렬화한다. row lock만으로는 서로 다른 task를 잡은 worker들이
      // 동시에 같은 빈 슬롯 수를 보고 전역 상한을 초과할 수 있다.
      await store.query("SELECT pg_advisory_xact_lock(hashtext('dataforseo-submit-capacity'))");
      const [{ occupied }] = await store.query<{ occupied: number }>(
        `SELECT count(*)::int AS occupied FROM provider_tasks
         WHERE provider='dataforseo' AND (
           status = ANY($1::text[])
           OR (status='reserved' AND lease_expires_at IS NOT NULL AND lease_expires_at > $2)
         )`,
        [IN_FLIGHT_PROVIDER_STATUSES, now],
      );
      const available = Math.min(input.limit, Math.max(0, input.maxInFlight - occupied));
      if (available === 0) return [];

      const rows = await store.query<Record<string, unknown>>(
        `WITH candidates AS (
           SELECT p.id FROM provider_tasks p
           WHERE p.provider='dataforseo' AND p.status='reserved'
             AND (p.lease_expires_at IS NULL OR p.lease_expires_at <= $4)
             AND ($5::text IS NULL OR p.organization_id=$5)
             AND (p.collection_request_id IS NULL OR EXISTS (
               SELECT 1 FROM collection_requests r
               WHERE r.id=p.collection_request_id AND r.cancel_requested=false AND r.status IN ('queued','running')
             ))
           ORDER BY p.created_at,p.id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE provider_tasks p
         SET lease_owner=$2,lease_expires_at=$3,updated_at=$4
         FROM candidates c WHERE p.id=c.id
         RETURNING p.*`,
        [available, input.owner.trim(), leaseExpiresAt, now, input.organizationId ?? null],
      );
      return rows.map(rowToTask);
    });
  }

  async claimRecoverable(input: ClaimRecoverableProviderTasksInput): Promise<ProviderTaskRecord[]> {
    if (!input.owner.trim()) throw new Error("worker owner가 필요합니다.");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("선점 limit은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1_000) throw new Error("lease는 1초 이상이어야 합니다.");

    const now = input.now ?? new Date().toISOString();
    const leaseExpiresAt = new Date(Date.parse(now) + input.leaseMs).toISOString();
    const rows = await (await this.database()).query<Record<string, unknown>>(
      `WITH candidates AS (
         SELECT id FROM provider_tasks
         WHERE provider='dataforseo' AND status = ANY($1::text[])
           AND (next_poll_at IS NULL OR next_poll_at <= $2)
           AND (lease_expires_at IS NULL OR lease_expires_at <= $2)
           AND ($3::text IS NULL OR organization_id=$3)
         ORDER BY COALESCE(next_poll_at,updated_at),created_at,id
         FOR UPDATE SKIP LOCKED
         LIMIT $4
       )
       UPDATE provider_tasks p
       SET lease_owner=$5,lease_expires_at=$6,updated_at=$2
       FROM candidates c WHERE p.id=c.id
       RETURNING p.*`,
      [RECOVERABLE_PROVIDER_STATUSES, now, input.organizationId ?? null, input.limit, input.owner.trim(), leaseExpiresAt],
    );
    return rows.map(rowToTask);
  }

  async beginSubmission(id: string, owner: string, attemptedAt: string): Promise<ProviderTaskRecord | null> {
    const db = await this.database();
    return db.transaction(async () => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext('dataforseo-submit-capacity'))");
      const [row] = await db.query<Record<string, unknown>>(
        `UPDATE provider_tasks
         SET status='submitting',submission_attempted_at=$3,updated_at=$3
         WHERE id=$1 AND status='reserved' AND lease_owner=$2 AND lease_expires_at>$3
           AND (collection_request_id IS NULL OR EXISTS (SELECT 1 FROM collection_requests r WHERE r.id=provider_tasks.collection_request_id AND NOT r.cancel_requested))
         RETURNING *`,
        [id, owner, attemptedAt],
      );
      return row ? rowToTask(row) : null;
    });
  }

  async get(id: string): Promise<ProviderTaskRecord | null> {
    const [row] = await (await this.database()).query<Record<string, unknown>>("SELECT * FROM provider_tasks WHERE id=$1", [id]);
    return row ? rowToTask(row) : null;
  }

  async getMany(ids: string[]): Promise<ProviderTaskRecord[]> {
    if (ids.length === 0) return [];
    const rows = await (await this.database()).query<Record<string, unknown>>(
      "SELECT * FROM provider_tasks WHERE id = ANY($1::text[])",
      [ids],
    );
    const byId = new Map(rows.map((row) => [row.id as string, rowToTask(row)]));
    return ids.flatMap((id) => {
      const task = byId.get(id);
      return task ? [task] : [];
    });
  }

  async getActivitySummary(organizationId: string, brandId: string): Promise<ProviderTaskActivitySummary> {
    return getCollectionActivitySummary(organizationId, brandId, await this.database());
  }

  async update(id: string, expected: ProviderTaskStatus | ProviderTaskStatus[], patch: ProviderTaskPatch): Promise<ProviderTaskRecord> {
    const store = await this.database();
    const current = await this.get(id);
    if (!current) throw new Error(`Provider task를 찾을 수 없습니다: ${id}`);
    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    const now = new Date().toISOString();
    const rows = await store.query<Record<string, unknown>>(
      `UPDATE provider_tasks SET status=$2,provider_task_id=$3,actual_cost_usd=$4,error_code=$5,error_message=$6,
         normalizer_version=$7,submitted_at=$8,completed_at=$9,submission_attempted_at=$10,
         lease_owner=$11,lease_expires_at=$12,next_poll_at=$13,updated_at=$14
       WHERE id=$1 AND status = ANY($15) RETURNING *`,
      [id, patch.status, patch.providerTaskId ?? current.providerTaskId, patch.actualCostUsd ?? current.actualCostUsd,
        patch.errorCode === undefined ? current.errorCode : patch.errorCode,
        patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
        patch.normalizerVersion ?? current.normalizerVersion, patch.submittedAt ?? current.submittedAt,
        patch.completedAt ?? current.completedAt,
        patch.submissionAttemptedAt === undefined ? current.submissionAttemptedAt : patch.submissionAttemptedAt,
        patch.leaseOwner === undefined ? current.leaseOwner : patch.leaseOwner,
        patch.leaseExpiresAt === undefined ? current.leaseExpiresAt : patch.leaseExpiresAt,
        patch.nextPollAt === undefined ? current.nextPollAt : patch.nextPollAt,
        now, expectedStatuses],
    );
    if (!rows[0]) throw new Error(`Provider task 상태 전이 충돌: ${id} (${current.status} → ${patch.status})`);
    return rowToTask(rows[0]);
  }

  async saveArtifact(artifact: ProviderArtifactRecord): Promise<void> {
    await (await this.database()).query(
      `INSERT INTO provider_artifacts (id,provider_task_id,kind,object_key,content_type,encoding,byte_size,checksum_sha256,created_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(provider_task_id,kind) DO UPDATE SET object_key=excluded.object_key,content_type=excluded.content_type,
         encoding=excluded.encoding,byte_size=excluded.byte_size,checksum_sha256=excluded.checksum_sha256,created_at=excluded.created_at,expires_at=excluded.expires_at`,
      [artifact.id, artifact.providerTaskId, artifact.kind, artifact.objectKey, artifact.contentType, artifact.encoding,
        artifact.byteSize, artifact.checksumSha256, artifact.createdAt, artifact.expiresAt],
    );
  }
}

/** DB 없이 상태 머신을 검증하는 단위 테스트용 구현. */
export class MemoryProviderTaskStore implements ProviderTaskStore {
  readonly tasks = new Map<string, ProviderTaskRecord>();
  readonly artifacts = new Map<string, ProviderArtifactRecord>();

  async reserve(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }> {
    const key = dedupeKey(input);
    const existing = [...this.tasks.values()].find((task) => task.dedupeKey === key);
    if (existing) return { task: existing, created: false };
    const id = `ptask-${randomUUID()}`;
    const now = new Date().toISOString();
    const config = DATAFORSEO_SURFACE_CONFIG[input.surface];
    const task: ProviderTaskRecord = {
      id, organizationId: input.organizationId, brandId: input.brandId ?? null, promptId: input.promptId ?? null,
      collectionRequestId: input.collectionRequestId ?? null, retryOfTaskId: input.retryOfTaskId ?? null,
      provider: "dataforseo", surface: input.surface, device: input.device, marketId: input.marketId,
      querySnapshot: input.query.trim(), scheduledWindow: input.scheduledWindow, dedupeKey: key,
      endpoint: config.postPath, tag: `neodio:${id}`, providerTaskId: null, status: "reserved", attempt: 1,
      estimatedCostUsd: config.estimatedCostUsd, actualCostUsd: 0, errorCode: null, errorMessage: null,
      normalizerVersion: null, submissionAttemptedAt: null, leaseOwner: null, leaseExpiresAt: null, nextPollAt: null,
      createdAt: now, updatedAt: now, submittedAt: null, completedAt: null,
    };
    this.tasks.set(id, task);
    return { task, created: true };
  }

  async reserveActive(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }> {
    const active = [...this.tasks.values()].find((task) => sameActiveIdentity(task, input));
    if (active) return { task: active, created: false };
    return this.reserve(input);
  }

  async reserveMany(inputs: ReserveProviderTaskInput[]): Promise<Array<{ task: ProviderTaskRecord; created: boolean }>> {
    const keys = inputs.map(dedupeKey);
    if (new Set(keys).size !== keys.length) throw new Error("한 수집 요청에 중복된 Provider task가 포함되어 있습니다.");
    const result = [];
    for (const input of inputs) result.push(await this.reserve(input));
    return result;
  }

  async attachToCollectionRequest(ids: string[], collectionRequestId: string): Promise<ProviderTaskRecord[]> {
    return ids.map((id) => {
      const current = this.tasks.get(id);
      if (!current || current.collectionRequestId) throw new Error("Provider task를 수집 요청에 모두 연결하지 못했습니다.");
      const updated = { ...current, collectionRequestId, updatedAt: new Date().toISOString() };
      this.tasks.set(id, updated);
      return updated;
    });
  }

  async quarantineStaleSubmissions(input: { limit: number; staleAfterMs: number; now?: string }): Promise<ProviderTaskRecord[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("stale task limit은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.staleAfterMs) || input.staleAfterMs < 60_000) throw new Error("stale 기준은 1분 이상이어야 합니다.");
    const now = input.now ?? new Date().toISOString();
    const cutoff = new Date(Date.parse(now) - input.staleAfterMs).toISOString();
    return [...this.tasks.values()]
      .filter((task) => task.status === "submitting"
        && (task.submissionAttemptedAt ?? task.updatedAt) <= cutoff
        && (!task.leaseExpiresAt || task.leaseExpiresAt <= now))
      .sort((a, b) => (a.submissionAttemptedAt ?? a.updatedAt).localeCompare(b.submissionAttemptedAt ?? b.updatedAt) || a.id.localeCompare(b.id))
      .slice(0, input.limit)
      .map((task) => {
        const updated: ProviderTaskRecord = {
          ...task,
          status: "submission_unknown",
          errorCode: "submission_stale",
          errorMessage: "Provider 제출 결과를 확인할 수 없어 자동 재제출하지 않습니다.",
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: now,
        };
        this.tasks.set(task.id, updated);
        return updated;
      });
  }

  async claimReserved(input: ClaimReservedProviderTasksInput): Promise<ProviderTaskRecord[]> {
    if (!input.owner.trim()) throw new Error("worker owner가 필요합니다.");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("선점 limit은 1 이상이어야 합니다.");
    if (!Number.isInteger(input.maxInFlight) || input.maxInFlight < 1) throw new Error("전역 in-flight 상한은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1_000) throw new Error("lease는 1초 이상이어야 합니다.");
    const now = input.now ?? new Date().toISOString();
    const occupied = [...this.tasks.values()].filter((task) =>
      IN_FLIGHT_PROVIDER_STATUSES.includes(task.status)
      || (task.status === "reserved" && !!task.leaseExpiresAt && task.leaseExpiresAt > now)
    ).length;
    const available = Math.min(input.limit, Math.max(0, input.maxInFlight - occupied));
    if (available === 0) return [];
    const leaseExpiresAt = new Date(Date.parse(now) + input.leaseMs).toISOString();
    const candidates = [...this.tasks.values()]
      .filter((task) => task.status === "reserved"
        && (!task.leaseExpiresAt || task.leaseExpiresAt <= now)
        && (!input.organizationId || task.organizationId === input.organizationId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, available);
    return candidates.map((task) => {
      const claimed = { ...task, leaseOwner: input.owner.trim(), leaseExpiresAt, updatedAt: now };
      this.tasks.set(task.id, claimed);
      return claimed;
    });
  }

  async claimRecoverable(input: ClaimRecoverableProviderTasksInput): Promise<ProviderTaskRecord[]> {
    if (!input.owner.trim()) throw new Error("worker owner가 필요합니다.");
    if (!Number.isInteger(input.limit) || input.limit < 1) throw new Error("선점 limit은 1 이상이어야 합니다.");
    if (!Number.isFinite(input.leaseMs) || input.leaseMs < 1_000) throw new Error("lease는 1초 이상이어야 합니다.");
    const now = input.now ?? new Date().toISOString();
    const leaseExpiresAt = new Date(Date.parse(now) + input.leaseMs).toISOString();
    const candidates = [...this.tasks.values()]
      .filter((task) => RECOVERABLE_PROVIDER_STATUSES.includes(task.status)
        && (!task.nextPollAt || task.nextPollAt <= now)
        && (!task.leaseExpiresAt || task.leaseExpiresAt <= now)
        && (!input.organizationId || task.organizationId === input.organizationId))
      .sort((a, b) => (a.nextPollAt ?? a.updatedAt).localeCompare(b.nextPollAt ?? b.updatedAt)
        || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, input.limit);
    return candidates.map((task) => {
      const claimed = { ...task, leaseOwner: input.owner.trim(), leaseExpiresAt, updatedAt: now };
      this.tasks.set(task.id, claimed);
      return claimed;
    });
  }

  async beginSubmission(id: string, owner: string, attemptedAt: string): Promise<ProviderTaskRecord | null> {
    const task = this.tasks.get(id);
    if (!task || task.status !== "reserved" || task.leaseOwner !== owner || !task.leaseExpiresAt || task.leaseExpiresAt <= attemptedAt) {
      return null;
    }
    const submitting: ProviderTaskRecord = { ...task, status: "submitting", submissionAttemptedAt: attemptedAt, updatedAt: attemptedAt };
    this.tasks.set(id, submitting);
    return submitting;
  }

  async get(id: string): Promise<ProviderTaskRecord | null> { return this.tasks.get(id) ?? null; }

  async getMany(ids: string[]): Promise<ProviderTaskRecord[]> {
    return ids.flatMap((id) => {
      const task = this.tasks.get(id);
      return task ? [task] : [];
    });
  }

  async getActivitySummary(organizationId: string, brandId: string): Promise<ProviderTaskActivitySummary> {
    const tasks = [...this.tasks.values()].filter((task) => task.organizationId === organizationId && task.brandId === brandId);
    const retriedIds = new Set(tasks.map((task) => task.retryOfTaskId).filter((id): id is string => id !== null));
    return {
      runningCount: tasks.filter((task) => ACTIVE_PROVIDER_STATUSES.includes(task.status)).length,
      attentionCount: tasks.filter((task) => COLLECTION_ATTENTION_STATUSES.includes(task.status)
        && !retriedIds.has(task.id)).length,
    };
  }

  async update(id: string, expected: ProviderTaskStatus | ProviderTaskStatus[], patch: ProviderTaskPatch): Promise<ProviderTaskRecord> {
    const current = this.tasks.get(id);
    if (!current) throw new Error(`Provider task를 찾을 수 없습니다: ${id}`);
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(current.status)) throw new Error(`Provider task 상태 전이 충돌: ${id} (${current.status} → ${patch.status})`);
    const updated: ProviderTaskRecord = {
      ...current, ...patch, providerTaskId: patch.providerTaskId === undefined ? current.providerTaskId : patch.providerTaskId,
      actualCostUsd: patch.actualCostUsd ?? current.actualCostUsd,
      errorCode: patch.errorCode === undefined ? current.errorCode : patch.errorCode,
      errorMessage: patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
      normalizerVersion: patch.normalizerVersion === undefined ? current.normalizerVersion : patch.normalizerVersion,
      submissionAttemptedAt: patch.submissionAttemptedAt === undefined ? current.submissionAttemptedAt : patch.submissionAttemptedAt,
      leaseOwner: patch.leaseOwner === undefined ? current.leaseOwner : patch.leaseOwner,
      leaseExpiresAt: patch.leaseExpiresAt === undefined ? current.leaseExpiresAt : patch.leaseExpiresAt,
      nextPollAt: patch.nextPollAt === undefined ? current.nextPollAt : patch.nextPollAt,
      submittedAt: patch.submittedAt === undefined ? current.submittedAt : patch.submittedAt,
      completedAt: patch.completedAt === undefined ? current.completedAt : patch.completedAt,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async saveArtifact(artifact: ProviderArtifactRecord): Promise<void> {
    this.artifacts.set(`${artifact.providerTaskId}:${artifact.kind}`, artifact);
  }
}
