import { createHash, randomUUID } from "node:crypto";
import { getPromptStore } from "@/lib/backend/database";
import { DATAFORSEO_SURFACE_CONFIG } from "./config";
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
  submittedAt?: string | null;
  completedAt?: string | null;
}

export interface ProviderTaskStore {
  reserve(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }>;
  get(id: string): Promise<ProviderTaskRecord | null>;
  update(id: string, expected: ProviderTaskStatus | ProviderTaskStatus[], patch: ProviderTaskPatch): Promise<ProviderTaskRecord>;
  saveArtifact(artifact: ProviderArtifactRecord): Promise<void>;
}

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

function rowToTask(row: Record<string, unknown>): ProviderTaskRecord {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    brandId: row.brand_id as string | null,
    promptId: row.prompt_id as string | null,
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
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    submittedAt: row.submitted_at as string | null,
    completedAt: row.completed_at as string | null,
  };
}

export class PostgresProviderTaskStore implements ProviderTaskStore {
  async reserve(input: ReserveProviderTaskInput): Promise<{ task: ProviderTaskRecord; created: boolean }> {
    const store = await getPromptStore();
    const key = dedupeKey(input);
    const id = `ptask-${randomUUID()}`;
    const now = new Date().toISOString();
    const config = DATAFORSEO_SURFACE_CONFIG[input.surface];
    const tag = `neodio:${id}`;
    const inserted = await store.query<Record<string, unknown>>(
      `INSERT INTO provider_tasks (
         id,organization_id,brand_id,prompt_id,provider,surface,device,market_id,query_snapshot,scheduled_window,dedupe_key,
         endpoint,tag,provider_task_id,status,attempt,estimated_cost_usd,actual_cost_usd,error_code,error_message,
         normalizer_version,created_at,updated_at,submitted_at,completed_at
       ) VALUES ($1,$2,$3,$4,'dataforseo',$5,$6,$7,$8,$9,$10,$11,$12,NULL,'reserved',1,$13,0,NULL,NULL,NULL,$14,$14,NULL,NULL)
       ON CONFLICT(dedupe_key) DO NOTHING RETURNING *`,
      [id, input.organizationId, input.brandId ?? null, input.promptId ?? null, input.surface, input.device, input.marketId,
        input.query.trim(), input.scheduledWindow, key, config.postPath, tag, config.estimatedCostUsd, now],
    );
    if (inserted[0]) return { task: rowToTask(inserted[0]), created: true };
    const [existing] = await store.query<Record<string, unknown>>("SELECT * FROM provider_tasks WHERE dedupe_key=$1", [key]);
    if (!existing) throw new Error("Provider task 중복 예약을 조회하지 못했습니다.");
    return { task: rowToTask(existing), created: false };
  }

  async get(id: string): Promise<ProviderTaskRecord | null> {
    const [row] = await (await getPromptStore()).query<Record<string, unknown>>("SELECT * FROM provider_tasks WHERE id=$1", [id]);
    return row ? rowToTask(row) : null;
  }

  async update(id: string, expected: ProviderTaskStatus | ProviderTaskStatus[], patch: ProviderTaskPatch): Promise<ProviderTaskRecord> {
    const store = await getPromptStore();
    const current = await this.get(id);
    if (!current) throw new Error(`Provider task를 찾을 수 없습니다: ${id}`);
    const expectedStatuses = Array.isArray(expected) ? expected : [expected];
    const now = new Date().toISOString();
    const rows = await store.query<Record<string, unknown>>(
      `UPDATE provider_tasks SET status=$2,provider_task_id=$3,actual_cost_usd=$4,error_code=$5,error_message=$6,
         normalizer_version=$7,submitted_at=$8,completed_at=$9,updated_at=$10
       WHERE id=$1 AND status = ANY($11) RETURNING *`,
      [id, patch.status, patch.providerTaskId ?? current.providerTaskId, patch.actualCostUsd ?? current.actualCostUsd,
        patch.errorCode === undefined ? current.errorCode : patch.errorCode,
        patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
        patch.normalizerVersion ?? current.normalizerVersion, patch.submittedAt ?? current.submittedAt,
        patch.completedAt ?? current.completedAt, now, expectedStatuses],
    );
    if (!rows[0]) throw new Error(`Provider task 상태 전이 충돌: ${id} (${current.status} → ${patch.status})`);
    return rowToTask(rows[0]);
  }

  async saveArtifact(artifact: ProviderArtifactRecord): Promise<void> {
    await (await getPromptStore()).query(
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
      provider: "dataforseo", surface: input.surface, device: input.device, marketId: input.marketId,
      querySnapshot: input.query.trim(), scheduledWindow: input.scheduledWindow, dedupeKey: key,
      endpoint: config.postPath, tag: `neodio:${id}`, providerTaskId: null, status: "reserved", attempt: 1,
      estimatedCostUsd: config.estimatedCostUsd, actualCostUsd: 0, errorCode: null, errorMessage: null,
      normalizerVersion: null, createdAt: now, updatedAt: now, submittedAt: null, completedAt: null,
    };
    this.tasks.set(id, task);
    return { task, created: true };
  }

  async get(id: string): Promise<ProviderTaskRecord | null> { return this.tasks.get(id) ?? null; }

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
