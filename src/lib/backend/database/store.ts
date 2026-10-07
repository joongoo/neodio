import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { BrandSeed, ManagedBrand, PromptLibraryRow, PromptRunSeed, PromptTopicGroup, SitemapCrawlResult } from "../../db/types";
import type { CollectedRunFile } from "../collectionRunsTypes";
import {
  brandChangeSummary,
  diffFields,
  groupsEqual,
  promptSummary,
  promptUpdateDetail,
  trackingStatusLabel,
  type ChangeEntity,
  type ChangeEntry,
  type ChangeOp,
  type ConfigSnapshot,
  type ConfigVersion,
} from "../../changeLog";
import { extractMentionsFromRun } from "../processing/mentions";
import { extractCitationsFromRun } from "../processing/citations";
import { schema } from "./schema";
import { AI_ANSWER_SURFACES, normalizeSurfaces, type PromptSurface } from "../../promptSurfaces";
import { AIO_GROUP_TO_PROMPT, aioGroupFor, normalizeKeyword } from "../../aioKeywordMapping";

export const normalize = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const label = (value?: string) => value && value.trim() !== "—" ? value.trim() : "";
export const ANALYSIS_VERSION = "keyword-heuristic-v2";

export interface PromptInput {
  text: string;
  category?: string;
  topic?: string;
  searchIntent?: string;
  sourceType?: string;
  sourceKey?: string;
  generationPurpose?: string;
  generationReasoning?: string;
  metadata?: unknown;
  actorId?: string | null;
  createdAt?: string;
}

interface PromptRecord {
  id: string; text: string; topic_id: string | null; category: string | null; topic: string | null;
  search_intent: string | null; created_at: string; updated_at: string;
}

interface Executor { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> }

// node-postgres, not @vercel/postgres, drives every query here: @vercel/postgres's
// client (backed by @neondatabase/serverless) speaks Neon's WebSocket proxy protocol
// and refuses to connect to a plain TCP Postgres, which makes it untestable against
// the local Postgres this sandbox can actually run. `pg` speaks the standard wire
// protocol and works identically against local Postgres, Vercel Postgres or any other
// standard Postgres, reading the same POSTGRES_URL/POSTGRES_URL_NON_POOLING env vars
// Vercel injects — see docs/database.md.
export class PromptStore {
  private readonly pool: Pool;
  private readonly als = new AsyncLocalStorage<{ client: PoolClient; depth: number }>();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  private exec(): Executor {
    return this.als.getStore()?.client ?? this.pool;
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.exec().query(text, params);
    return result.rows as T[];
  }

  private async one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0];
  }

  private async run(text: string, params: unknown[] = []): Promise<number> {
    return (await this.exec().query(text, params)).rowCount ?? 0;
  }

  async init(): Promise<void> {
    await this.transaction(async () => {
      // Several processes can init at once (Vercel build workers prerendering
      // pages in parallel, serverless cold starts). CREATE TABLE IF NOT EXISTS
      // is not safe under concurrency — two creators of a new table collide on
      // pg_type ("duplicate key ... pg_type_typname_nsp_index"). A transaction-
      // scoped advisory lock makes the inits take turns; it's released on commit.
      await this.run("SELECT pg_advisory_xact_lock(hashtext('neodio-schema-init'))");
      // No params here, so pg uses the simple query protocol and runs every
      // statement in `schema` (semicolon-separated) in one round trip.
      await this.exec().query(schema);
      await this.run("INSERT INTO schema_migrations VALUES (1,$1) ON CONFLICT DO NOTHING", [now()]);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const existing = this.als.getStore();
    if (existing) { existing.depth++; try { return await fn(); } finally { existing.depth--; } }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await this.als.run({ client, depth: 1 }, fn);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureOrg(orgId: string, name = orgId): Promise<void> {
    await this.run("INSERT INTO organizations VALUES ($1,$2) ON CONFLICT DO NOTHING", [orgId, name]);
  }

  // 조직 관리(설정 > 조직 관리) — 헤더의 조직 스위처가 이 목록을 쓴다.
  // slug = URL의 조직 자리(/{slug}/{브랜드}/…). 예전 조직은 초기화 때 채워진다(database/index.ts).
  async listOrganizations(): Promise<{ id: string; name: string; slug: string; brandCount: number }[]> {
    return this.query<{ id: string; name: string; slug: string; brandCount: number }>(
      `SELECT o.id, o.name, coalesce(o.slug, o.id) AS slug, count(b.id)::int AS "brandCount" FROM organizations o
       LEFT JOIN brands b ON b.organization_id=o.id GROUP BY o.id,o.name,o.slug ORDER BY o.name`
    );
  }

  async createOrganization(name: string, slug: string): Promise<{ id: string; name: string; slug: string }> {
    const orgId = id("org");
    await this.run("INSERT INTO organizations (id,name,slug) VALUES ($1,$2,$3)", [orgId, name, slug]);
    return { id: orgId, name, slug };
  }

  async updateOrganization(orgId: string, patch: { name?: string; slug?: string }): Promise<boolean> {
    return (
      (await this.run("UPDATE organizations SET name=coalesce($2,name), slug=coalesce($3,slug) WHERE id=$1", [
        orgId,
        patch.name ?? null,
        patch.slug ?? null,
      ])) > 0
    );
  }

  /** 브랜드가 남아 있는 조직은 지우지 않는다(false). 브랜드가 없으면 조직에 딸린 프롬프트·수집 기록까지 정리한다. */
  async deleteOrganization(orgId: string): Promise<boolean> {
    return this.transaction(async () => {
      const [{ n }] = await this.query<{ n: number }>("SELECT count(*)::int AS n FROM brands WHERE organization_id=$1", [orgId]);
      if (n > 0) return false;
      const scoped = ["detected_brand_decisions", "bridge_entries", "legacy_library_ids", "sitemap_crawls", "change_log", "config_versions", "neodio_membership_brands", "neodio_memberships", "neodio_audit_log"];
      for (const table of scoped) await this.run(`DELETE FROM ${table} WHERE organization_id=$1`, [orgId]);
      await this.run("DELETE FROM tracking_events WHERE tracking_id IN (SELECT id FROM prompt_tracking WHERE organization_id=$1)", [orgId]);
      await this.run("DELETE FROM prompt_tracking WHERE organization_id=$1", [orgId]);
      await this.run(
        "DELETE FROM citations WHERE analysis_id IN (SELECT a.id FROM run_analyses a JOIN prompt_runs r ON r.id=a.run_id WHERE r.organization_id=$1)",
        [orgId]
      );
      await this.run(
        "DELETE FROM brand_observations WHERE analysis_id IN (SELECT a.id FROM run_analyses a JOIN prompt_runs r ON r.id=a.run_id WHERE r.organization_id=$1)",
        [orgId]
      );
      await this.run("DELETE FROM run_analyses WHERE run_id IN (SELECT id FROM prompt_runs WHERE organization_id=$1)", [orgId]);
      await this.run("DELETE FROM prompt_runs WHERE organization_id=$1", [orgId]);
      await this.run("DELETE FROM collection_jobs WHERE organization_id=$1", [orgId]);
      await this.run("DELETE FROM prompt_sources WHERE prompt_id IN (SELECT id FROM prompts WHERE organization_id=$1)", [orgId]);
      await this.run("DELETE FROM prompts WHERE organization_id=$1", [orgId]);
      await this.run("DELETE FROM topics WHERE organization_id=$1", [orgId]);
      await this.run("DELETE FROM categories WHERE organization_id=$1", [orgId]);
      await this.run("DELETE FROM actors WHERE organization_id=$1", [orgId]);
      return (await this.run("DELETE FROM organizations WHERE id=$1", [orgId])) > 0;
    });
  }

  /** 조직을 모르는 곳(정기 수집 CLI 등)에서 브랜드 ID로 찾는다. */
  async getBrandById(brandId: string): Promise<ManagedBrand | null> {
    const row = await this.one("SELECT * FROM brands WHERE id=$1", [brandId]);
    return row ? this.toBrand(row) : null;
  }

  async legacyActor(orgId: string, displayName: string | null): Promise<string | null> {
    if (!displayName) return null;
    const actorId = `legacy-${hash([orgId, displayName]).slice(0, 24)}`;
    await this.run("INSERT INTO actors VALUES ($1,$2,$3,'legacy') ON CONFLICT DO NOTHING", [actorId, orgId, displayName]);
    return actorId;
  }

  async category(orgId: string, name: string): Promise<string> {
    await this.ensureOrg(orgId);
    const key = normalize(name);
    const existing = await this.one<{ id: string }>("SELECT id FROM categories WHERE organization_id=$1 AND normalized_name=$2", [orgId, key]);
    if (existing) return existing.id;
    const categoryId = id("category");
    await this.run("INSERT INTO categories VALUES ($1,$2,$3,$4,$5,$6)", [categoryId, orgId, name.trim(), key, now(), now()]);
    return categoryId;
  }

  private async topic(orgId: string, name: string, categoryId: string | null): Promise<string> {
    const existing = await this.one<{ id: string }>(
      "SELECT id FROM topics WHERE organization_id=$1 AND category_id IS NOT DISTINCT FROM $2 AND normalized_name=$3",
      [orgId, categoryId, normalize(name)]);
    if (existing) return existing.id;
    const topicId = id("topic");
    await this.run("INSERT INTO topics VALUES ($1,$2,$3,$4,$5,$6,$7)", [topicId, orgId, categoryId, name.trim(), normalize(name), now(), now()]);
    return topicId;
  }

  async getPrompt(orgId: string, promptId: string): Promise<PromptRecord | undefined> {
    return this.one<PromptRecord>(`SELECT p.*,t.name AS topic,c.name AS category FROM prompts p
      LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      WHERE p.organization_id=$1 AND p.id=$2`, [orgId, promptId]);
  }

  async upsertPrompt(orgId: string, input: PromptInput, replaceClassification = false): Promise<string> {
    return this.transaction(async () => {
      if (!normalize(input.text)) throw new Error("Prompt text is required");
      await this.ensureOrg(orgId);
      const newId = id("prompt");
      const inserted = await this.one<{ id: string }>(
        `INSERT INTO prompts(id,organization_id,text,normalized_text,created_by,updated_by,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT(organization_id,normalized_text) DO NOTHING
          RETURNING id`,
        [newId, orgId, input.text.trim(), normalize(input.text), input.actorId ?? null, input.actorId ?? null, input.createdAt ?? now(), input.createdAt ?? now()]);
      const existing = inserted ? undefined : await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2", [orgId, normalize(input.text)]);
      const promptId = inserted?.id ?? existing!.id;
      if (!existing || replaceClassification) await this.classify(orgId, promptId, input.category, input.topic);
      if (input.searchIntent) await this.run("UPDATE prompts SET search_intent=$1 WHERE id=$2", [input.searchIntent, promptId]);
      if (input.sourceType) {
        await this.run(`INSERT INTO prompt_sources VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT(prompt_id,source_type,source_key) DO UPDATE SET
          generation_purpose=coalesce(excluded.generation_purpose,prompt_sources.generation_purpose),
          generation_reasoning=coalesce(excluded.generation_reasoning,prompt_sources.generation_reasoning),metadata_json=excluded.metadata_json`,
          [id("source"), promptId, input.sourceType, input.sourceKey ?? "", input.generationPurpose ?? null,
            input.generationReasoning ?? null, JSON.stringify(input.metadata ?? {}), input.createdAt ?? now()]);
      }
      return promptId;
    });
  }

  private async classify(orgId: string, promptId: string, category?: string, topic?: string): Promise<void> {
    const categoryId = label(category) ? await this.category(orgId, label(category)) : null;
    const topicId = label(topic) ? await this.topic(orgId, label(topic), categoryId) : null;
    await this.run("UPDATE prompts SET topic_id=$1,uncategorized_category_id=$2,updated_at=$3 WHERE organization_id=$4 AND id=$5",
      [topicId, topicId ? null : categoryId, now(), orgId, promptId]);
  }

  // ---- 설정 변경 이력 ----

  /** 같은 트랜잭션 안에서 변경을 기록한다 — 쓰기가 롤백되면 이력도 함께 사라진다. */
  async logChange(orgId: string | null, entry: {
    brandId?: string | null; entityType: ChangeEntity; entityId: string; op: ChangeOp;
    summary: string; before?: unknown; after?: unknown; actorId?: string | null; actorUserId?: string | null;
  }): Promise<void> {
    await this.run(`INSERT INTO change_log(id,organization_id,brand_id,entity_type,entity_id,op,summary,before_json,after_json,actor_id,at,actor_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
      id("change"), orgId, entry.brandId ?? null, entry.entityType, entry.entityId, entry.op, entry.summary,
      entry.before === undefined ? null : JSON.stringify(entry.before), entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.actorId ?? null, now(), entry.actorUserId ?? null]);
  }

  async listChanges(orgId: string, options: { brandId?: string; limit?: number; before?: string; includeUsers?: boolean } = {}): Promise<ChangeEntry[]> {
    const rows = await this.query<Record<string, unknown>>(
      `SELECT c.*,coalesce(a.display_name,u.name) AS actor_name FROM change_log c LEFT JOIN actors a ON a.id=c.actor_id LEFT JOIN neodio_users u ON u.id=c.actor_user_id
       WHERE c.organization_id=$1 AND ($2::text IS NULL OR c.brand_id=$2 OR c.brand_id IS NULL) AND ($3::text IS NULL OR c.at<$3)
         AND ($5::boolean OR c.entity_type<>'user')
       ORDER BY c.at DESC,c.id LIMIT $4`,
      [orgId, options.brandId ?? null, options.before ?? null, Math.min(options.limit ?? 50, 200), options.includeUsers ?? true]);
    return rows.map((row) => this.toChangeEntry(row));
  }

  /** 한 유저에 대한 변경 이력 — orgIds가 null이면 모든 조직(조직 없는 변경 포함), 아니면 그 조직들의 것만. */
  async listUserChanges(userId: string, orgIds: string[] | null, limit = 50): Promise<ChangeEntry[]> {
    const rows = await this.query<Record<string, unknown>>(
      `SELECT c.*,coalesce(a.display_name,u.name) AS actor_name FROM change_log c LEFT JOIN actors a ON a.id=c.actor_id LEFT JOIN neodio_users u ON u.id=c.actor_user_id
       WHERE c.entity_type='user' AND c.entity_id=$1 AND ($2::text[] IS NULL OR c.organization_id = ANY($2))
       ORDER BY c.at DESC,c.id LIMIT $3`, [userId, orgIds, Math.min(limit, 200)]);
    return rows.map((row) => this.toChangeEntry(row));
  }

  private toChangeEntry(row: Record<string, unknown>): ChangeEntry {
    return {
      id: row.id as string, organizationId: (row.organization_id as string | null) ?? null, brandId: (row.brand_id as string | null) ?? null,
      entityType: row.entity_type as ChangeEntity, entityId: row.entity_id as string, op: row.op as ChangeOp,
      summary: row.summary as string, before: row.before_json, after: row.after_json,
      actorId: (row.actor_id as string | null) ?? (row.actor_user_id as string | null) ?? null, actorName: (row.actor_name as string | null) ?? null, at: row.at as string,
    };
  }

  /** 지금 설정 전체 — 이름 붙인 버전에 함께 저장한다. */
  async configSnapshot(orgId: string, brandId?: string): Promise<ConfigSnapshot> {
    // 보관(archived)한 프롬프트는 빼고, 일시중지한 프롬프트는 설정의 일부라 함께 담는다(library()는 활성만 반환).
    const rows = await this.query<{ id: string; prompt: string; category: string; topic: string; status: string }>(
      `SELECT tr.id,p.text AS prompt,coalesce(c.name,'') AS category,coalesce(t.name,'—') AS topic,tr.status
       FROM prompt_tracking tr JOIN prompts p ON p.id=tr.prompt_id
       LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
       WHERE tr.organization_id=$1 AND tr.status IN ('active','paused') AND ($2::text IS NULL OR tr.brand_id=$2) ORDER BY tr.added_at,tr.id`,
      [orgId, brandId ?? null]);
    const surfaces = await this.trackingSurfaces(orgId, rows.map((row) => row.id));
    const brand = brandId ? await this.getBrand(orgId, brandId) : null;
    return {
      prompts: rows.map((row) => ({
        text: row.prompt, category: row.category, topic: row.topic, status: row.status, surfaces: surfaces.get(row.id) ?? [],
      })),
      topicGroups: await this.groups(orgId),
      brand: brand ? (brand as unknown as Record<string, unknown>) : null,
    };
  }

  async createConfigVersion(orgId: string, input: { brandId?: string; label: string; note?: string; actorId?: string | null }): Promise<ConfigVersion> {
    const label = input.label.trim();
    if (!label) throw new Error("버전 이름을 입력해주세요.");
    return this.transaction(async () => {
      await this.ensureOrg(orgId);
      const [last] = await this.query<{ version: number }>(
        "SELECT max(version) AS version FROM config_versions WHERE organization_id=$1 AND ($2::text IS NULL AND brand_id IS NULL OR brand_id=$2)", [orgId, input.brandId ?? null]);
      const version = (last?.version ?? 0) + 1;
      const content = await this.configSnapshot(orgId, input.brandId);
      const versionId = id("version");
      await this.run("INSERT INTO config_versions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
        versionId, orgId, input.brandId ?? null, version, label, input.note?.trim() || null, input.actorId ?? null, now(), JSON.stringify(content)]);
      return (await this.getConfigVersion(orgId, versionId, true))!;
    });
  }

  private toConfigVersion(row: Record<string, unknown>, withContent: boolean): ConfigVersion {
    const content = row.content_json as ConfigSnapshot;
    return {
      id: row.id as string, organizationId: row.organization_id as string, brandId: (row.brand_id as string | null) ?? null,
      version: Number(row.version), label: row.label as string, note: (row.note as string | null) ?? null,
      createdBy: (row.created_by as string | null) ?? null, createdByName: (row.actor_name as string | null) ?? null, createdAt: row.created_at as string,
      stats: { prompts: content.prompts.length, topics: content.topicGroups.length },
      ...(withContent ? { content } : {}),
    };
  }

  async getConfigVersion(orgId: string, versionId: string, withContent = false): Promise<ConfigVersion | null> {
    const row = await this.one(`SELECT v.*,a.display_name AS actor_name FROM config_versions v LEFT JOIN actors a ON a.id=v.created_by
      WHERE v.organization_id=$1 AND v.id=$2`, [orgId, versionId]);
    return row ? this.toConfigVersion(row, withContent) : null;
  }

  async listConfigVersions(orgId: string, brandId?: string): Promise<ConfigVersion[]> {
    const rows = await this.query(`SELECT v.*,a.display_name AS actor_name FROM config_versions v LEFT JOIN actors a ON a.id=v.created_by
      WHERE v.organization_id=$1 AND ($2::text IS NULL OR v.brand_id=$2 OR v.brand_id IS NULL) ORDER BY v.created_at DESC`, [orgId, brandId ?? null]);
    return rows.map((row) => this.toConfigVersion(row, false));
  }

  private async promptState(orgId: string, trackingId: string) {
    return this.one<{ prompt: string; category: string; topic: string; status: string; brand_id: string; prompt_id: string }>(
      `SELECT p.text AS prompt,coalesce(c.name,'') AS category,coalesce(t.name,'—') AS topic,tr.status,tr.brand_id,tr.prompt_id
       FROM prompt_tracking tr JOIN prompts p ON p.id=tr.prompt_id
       LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
       WHERE tr.organization_id=$1 AND tr.id=$2`, [orgId, trackingId]);
  }

  async track(orgId: string, input: PromptInput, options: {
    brandId: string; origin: PromptLibraryRow["origin"]; legacyId?: string; addedAt?: string;
    /** 플랫폼 — 새 추적의 기본값은 지금까지 라이브러리가 수집하던 플랫폼(네이버 AI·Google AI 모드). 이미 있는 추적에 넘기면 그 값으로 바꾼다. */
    surfaces?: PromptSurface[];
  }): Promise<PromptLibraryRow> {
    return this.transaction(async () => {
      const promptId = await this.upsertPrompt(orgId, input);
      const existing = await this.one<{ id: string; status: string }>(
        "SELECT id,status FROM prompt_tracking WHERE organization_id=$1 AND prompt_id=$2 AND brand_id=$3", [orgId, promptId, options.brandId]);
      const trackingId = existing?.id ?? options.legacyId ?? `tracked-${Date.now()}-${randomUUID().replaceAll("-", "")}`;
      const at = options.addedAt ?? now();
      if (!existing) {
        await this.run("INSERT INTO prompt_tracking VALUES ($1,$2,$3,$4,'active',$5,$6,$7,NULL,NULL,$8)",
          [trackingId, orgId, promptId, options.brandId, options.origin, at, input.actorId ?? null, at]);
      } else if (existing.status !== "active") {
        await this.run("UPDATE prompt_tracking SET status='active',paused_at=NULL,archived_at=NULL,updated_at=$1 WHERE id=$2", [at, trackingId]);
      }
      if (!existing || existing.status !== "active") await this.run("INSERT INTO tracking_events VALUES ($1,$2,'active',$3,$4)", [id("event"), trackingId, input.actorId ?? null, at]);
      // 사용자가 프롬프트를 추가·재개한 것만 기록 — 예전 데이터 이관(legacyId)은 이력 대상이 아니다.
      if (!options.legacyId && (!existing || existing.status !== "active")) {
        await this.logChange(orgId, {
          brandId: options.brandId, entityType: "prompt", entityId: trackingId, op: existing ? "update" : "create", actorId: input.actorId,
          summary: existing ? promptSummary("status", input.text, "재개") : promptSummary("create", input.text),
          before: existing ? { status: existing.status } : undefined,
          after: { prompt: input.text.trim(), category: input.category ?? "", topic: input.topic ?? "", status: "active", origin: options.origin },
        });
      }
      if (options.legacyId) await this.run("INSERT INTO legacy_library_ids VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [orgId, options.legacyId, trackingId]);
      if (options.surfaces) await this.setTrackingSurfaces(orgId, trackingId, options.surfaces);
      else if (!existing) await this.setTrackingSurfaces(orgId, trackingId, AI_ANSWER_SURFACES);
      else await this.syncAioKeyword(trackingId); // 다시 켠 추적이면 AIO 수집 대상도 함께 되살린다
      const rows = await this.library(orgId, options.brandId);
      return rows.find(row => row.id === trackingId)!;
    });
  }

  async library(orgId: string, brandId?: string): Promise<PromptLibraryRow[]> {
    const rows = await this.query(`SELECT tr.id,tr.prompt_id AS "promptId",p.text AS prompt,tr.origin,
      coalesce(c.name,'') AS category,coalesce(t.name,'—') AS topic,p.updated_at AS "lastModifiedAt",
      a.display_name AS "lastModifiedBy",tr.added_at AS "addedAt",aa.display_name AS "addedBy",
      p.search_intent AS "searchIntent",tr.status AS "trackingStatus",
      (SELECT coalesce(array_agg(s.surface),'{}') FROM prompt_tracking_surfaces s WHERE s.tracking_id=tr.id) AS surfaces
      FROM prompt_tracking tr JOIN prompts p ON p.id=tr.prompt_id
      LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      LEFT JOIN actors a ON a.id=p.updated_by LEFT JOIN actors aa ON aa.id=tr.added_by
      WHERE tr.organization_id=$1 AND tr.status='active' AND ($2::text IS NULL OR tr.brand_id=$2) ORDER BY tr.added_at DESC,tr.id`,
      [orgId, brandId ?? null]);
    return rows.map(row => ({ ...row, surfaces: normalizeSurfaces((row as { surfaces?: unknown }).surfaces) })) as unknown as PromptLibraryRow[];
  }

  /** 추적(트래킹 id)마다 켜진 플랫폼. 플랫폼이 하나도 없는 추적은 맵에 키가 없다. */
  async trackingSurfaces(orgId: string, trackingIds?: string[]): Promise<Map<string, PromptSurface[]>> {
    const rows = await this.query<{ tracking_id: string; surface: string }>(
      `SELECT s.tracking_id,s.surface FROM prompt_tracking_surfaces s JOIN prompt_tracking t ON t.id=s.tracking_id
       WHERE t.organization_id=$1 AND ($2::text[] IS NULL OR s.tracking_id = ANY($2))`,
      [orgId, trackingIds ?? null]
    );
    const bySurface = new Map<string, string[]>();
    for (const row of rows) bySurface.set(row.tracking_id, [...(bySurface.get(row.tracking_id) ?? []), row.surface]);
    return new Map([...bySurface].map(([trackingId, surfaces]) => [trackingId, normalizeSurfaces(surfaces)]));
  }

  /** 추적의 플랫폼을 통째로 바꾼다. 이 조직의 추적이 아니면 false. 옛 라이브러리 id도 받는다. */
  async setTrackingSurfaces(orgId: string, trackingId: string, surfaces: PromptSurface[]): Promise<boolean> {
    return this.transaction(async () => {
      const row = await this.one<{ id: string }>(`SELECT id FROM prompt_tracking WHERE organization_id=$1 AND
        (id=$2 OR id IN (SELECT tracking_id FROM legacy_library_ids WHERE organization_id=$1 AND legacy_id=$2))`, [orgId, trackingId]);
      if (!row) return false;
      const wanted = normalizeSurfaces(surfaces);
      await this.run("DELETE FROM prompt_tracking_surfaces WHERE tracking_id=$1", [row.id]);
      const at = now();
      for (const surface of wanted) await this.run("INSERT INTO prompt_tracking_surfaces VALUES ($1,$2,$3)", [row.id, surface, at]);
      await this.syncAioKeyword(row.id);
      return true;
    });
  }

  /**
   * 추적의 Google AI Overview 플랫폼과 AIO 수집 대상(aio_keywords)을 맞춘다 — AIO 수집과 화면은 아직 aio_keywords를 읽는다(3단계에서 전환).
   * 추적이 활성이고 AIO 플랫폼이 켜져 있으면 키워드를 만들거나 되살리고, 아니면 보관한다. 브랜드 행이 없는 추적(시험 데이터)은 건드리지 않는다.
   */
  async syncAioKeyword(trackingId: string): Promise<void> {
    const t = await this.one<{ organization_id: string; prompt_id: string; brand_id: string; status: string; text: string; search_intent: string | null; topic: string | null }>(
      `SELECT tr.organization_id,tr.prompt_id,tr.brand_id,tr.status,p.text,p.search_intent,tp.name AS topic FROM prompt_tracking tr
       JOIN prompts p ON p.id=tr.prompt_id LEFT JOIN topics tp ON tp.id=p.topic_id WHERE tr.id=$1`, [trackingId]);
    if (!t) return;
    const brand = await this.one<{ id: string }>("SELECT id FROM brands WHERE id=$1 AND organization_id=$2", [t.brand_id, t.organization_id]);
    if (!brand) return;
    const surfaces = (await this.trackingSurfaces(t.organization_id, [trackingId])).get(trackingId) ?? [];
    const wanted = t.status === "active" && surfaces.includes("google-aio");
    const normalized = normalizeKeyword(t.text);
    const existing = await this.one<{ id: string; status: string; prompt_id: string | null }>(
      "SELECT id,status,prompt_id FROM aio_keywords WHERE brand_id=$1 AND (prompt_id=$2 OR normalized_keyword=$3) ORDER BY (prompt_id=$2) DESC LIMIT 1", [t.brand_id, t.prompt_id, normalized]);
    if (wanted) {
      if (existing) await this.run("UPDATE aio_keywords SET status='active',prompt_id=$1 WHERE id=$2", [t.prompt_id, existing.id]);
      else await this.run(
        `INSERT INTO aio_keywords (id,brand_id,keyword,normalized_keyword,keyword_group,status,created_at,prompt_id) VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
        [id("aiokw"), t.brand_id, t.text, normalized, aioGroupFor(t.search_intent, t.topic), now(), t.prompt_id]);
    } else if (existing && existing.status === "active" && existing.prompt_id === t.prompt_id) {
      // 이 프롬프트에 이어진 키워드만 끈다 — 같은 문장의 AIO 키워드가 아직 이어지지 않았다면 그대로 둔다(아직 이 시스템이 관리하지 않는 것).
      await this.run("UPDATE aio_keywords SET status='archived' WHERE id=$1", [existing.id]);
    }
  }

  /**
   * AIO 키워드 하나를 프롬프트로 잇는다: 프롬프트를 만들거나(같은 문장이 이미 있으면 재사용하고 분류는 유지) 이 브랜드의 추적을 만들고,
   * 활성 키워드면 추적에 Google AI Overview 플랫폼을 켠 뒤 aio_keywords.prompt_id를 채운다.
   * 이미 이어진 키워드는 프롬프트를 다시 만들지 않는다 — 활성이면 보관해 뒀던 추적과 AIO 플랫폼만 되살린다(키워드를 다시 추가한 경우).
   * linked는 이번에 새로 이은 경우에만 true.
   */
  async linkAioKeyword(keywordId: string, options: { classify?: boolean } = {}): Promise<{ linked: boolean; createdPrompt: boolean; trackingCreated: boolean; trackingReactivated: boolean; trackingArchived: boolean; keyword: string; organizationId: string } | null> {
    return this.transaction(async () => {
      const row = await this.one<{ id: string; brand_id: string; keyword: string; keyword_group: keyof typeof AIO_GROUP_TO_PROMPT; status: "active" | "archived"; organization_id: string; prompt_id: string | null }>(
        `SELECT k.id,k.brand_id,k.keyword,k.keyword_group,k.status,k.prompt_id,b.organization_id FROM aio_keywords k JOIN brands b ON b.id=k.brand_id WHERE k.id=$1`, [keywordId]);
      if (!row) return null;
      const result = { linked: false, createdPrompt: false, trackingCreated: false, trackingReactivated: false, trackingArchived: false, keyword: row.keyword, organizationId: row.organization_id };
      const orgId = row.organization_id;
      if (row.prompt_id && row.status === "archived") return result;

      let promptId = row.prompt_id;
      if (!promptId) {
        const existingPrompt = await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2", [orgId, normalize(row.keyword)]);
        const mapping = options.classify === false ? {} : AIO_GROUP_TO_PROMPT[row.keyword_group] ?? {};
        // 이미 있는 프롬프트의 분류(토픽·검색 의도)는 덮어쓰지 않는다.
        promptId = await this.upsertPrompt(orgId, {
          text: row.keyword, sourceType: "aio-keyword", sourceKey: row.id,
          ...(existingPrompt ? {} : { topic: mapping.topic, searchIntent: mapping.searchIntent }),
        });
        result.createdPrompt = !existingPrompt;
        // 플랫폼을 켜기 전에 이어 둔다 — 동기화가 이 키워드를 그대로 쓰게.
        await this.run("UPDATE aio_keywords SET prompt_id=$1 WHERE id=$2", [promptId, row.id]);
        result.linked = true;
      }

      const before = await this.one<{ id: string; status: string }>(
        "SELECT id,status FROM prompt_tracking WHERE organization_id=$1 AND prompt_id=$2 AND brand_id=$3", [orgId, promptId, row.brand_id]);
      let trackingId = before?.id;
      if (row.status === "active" || !before) {
        // 새 추적은 AIO 플랫폼만 갖는다. 보관된 키워드는 플랫폼 없이 만들어 곧바로 보관한다(동기화가 되살리지 않게). 이미 있는 추적의 플랫폼은 건드리지 않는다.
        const tracked = await this.track(orgId, { text: row.keyword }, {
          brandId: row.brand_id, origin: "manual",
          ...(before ? {} : { surfaces: row.status === "active" ? (["google-aio"] as PromptSurface[]) : [] }),
        });
        trackingId = tracked.id;
        result.trackingCreated = !before;
        result.trackingReactivated = !!before && before.status !== "active";
        if (row.status === "archived") {
          await this.setTrackingStatus(orgId, tracked.id, "archived");
          result.trackingArchived = true;
        }
      }
      if (row.status === "active") {
        const surfaces = (await this.trackingSurfaces(orgId, [trackingId!])).get(trackingId!) ?? [];
        await this.setTrackingSurfaces(orgId, trackingId!, [...surfaces, "google-aio"]);
      }
      return result;
    });
  }

  /** AIO 키워드를 보관할 때 — 추적에서 AIO 플랫폼을 끄고, 다른 플랫폼이 하나도 없으면 추적도 보관한다(라이브러리에 빈 프롬프트가 남지 않게). */
  async unlinkAioKeyword(brandId: string, keywordId: string): Promise<void> {
    await this.transaction(async () => {
      const row = await this.one<{ prompt_id: string | null; organization_id: string }>(
        "SELECT k.prompt_id,b.organization_id FROM aio_keywords k JOIN brands b ON b.id=k.brand_id WHERE k.id=$1 AND k.brand_id=$2", [keywordId, brandId]);
      await this.run("UPDATE aio_keywords SET status='archived' WHERE brand_id=$1 AND id=$2", [brandId, keywordId]);
      if (!row?.prompt_id) return;
      const tracking = await this.one<{ id: string; status: string }>(
        "SELECT id,status FROM prompt_tracking WHERE organization_id=$1 AND prompt_id=$2 AND brand_id=$3", [row.organization_id, row.prompt_id, brandId]);
      if (!tracking || tracking.status === "archived") return;
      const rest = ((await this.trackingSurfaces(row.organization_id, [tracking.id])).get(tracking.id) ?? []).filter((surface) => surface !== "google-aio");
      await this.setTrackingSurfaces(row.organization_id, tracking.id, rest);
      if (rest.length === 0) await this.setTrackingStatus(row.organization_id, tracking.id, "archived");
    });
  }

  async setTrackingStatus(orgId: string, trackingId: string, status: "active" | "paused" | "archived"): Promise<boolean> {
    return this.transaction(async () => {
      const row = await this.one<{ id: string }>(`SELECT id FROM prompt_tracking WHERE organization_id=$1 AND
        (id=$2 OR id IN (SELECT tracking_id FROM legacy_library_ids WHERE organization_id=$1 AND legacy_id=$2))`, [orgId, trackingId]);
      if (!row) return false;
      const before = await this.promptState(orgId, row.id);
      const at = now();
      await this.run("UPDATE prompt_tracking SET status=$1,paused_at=$2,archived_at=$3,updated_at=$4 WHERE id=$5",
        [status, status === "paused" ? at : null, status === "archived" ? at : null, at, row.id]);
      await this.run("INSERT INTO tracking_events VALUES ($1,$2,$3,NULL,$4)", [id("event"), row.id, status, at]);
      await this.syncAioKeyword(row.id);
      if (before && before.status !== status) {
        await this.logChange(orgId, {
          brandId: before.brand_id, entityType: "tracking", entityId: row.id, op: "update",
          summary: promptSummary("status", before.prompt, trackingStatusLabel(status)), before: { status: before.status }, after: { status },
        });
      }
      return true;
    });
  }

  async updateLibrary(orgId: string, trackingId: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "topic">): Promise<PromptLibraryRow | null> {
    return this.transaction(async () => {
      const tracking = await this.one<{ prompt_id: string }>("SELECT prompt_id FROM prompt_tracking WHERE organization_id=$1 AND id=$2", [orgId, trackingId]);
      if (!tracking) return null;
      const beforeState = await this.promptState(orgId, trackingId);
      if (!normalize(patch.prompt)) throw new Error("Prompt text is required");
      const duplicate = await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2 AND id<>$3",
        [orgId, normalize(patch.prompt), tracking.prompt_id]);
      if (duplicate) throw new Error("An identical prompt already exists");
      await this.run("UPDATE prompts SET text=$1,normalized_text=$2,updated_at=$3 WHERE id=$4", [patch.prompt.trim(), normalize(patch.prompt), now(), tracking.prompt_id]);
      await this.classify(orgId, tracking.prompt_id, patch.category, patch.topic);
      const afterState = await this.promptState(orgId, trackingId);
      if (beforeState && afterState) {
        const detail = promptUpdateDetail(beforeState, afterState);
        if (detail) {
          await this.logChange(orgId, {
            brandId: afterState.brand_id, entityType: "prompt", entityId: trackingId, op: "update",
            summary: promptSummary("update", afterState.prompt, detail),
            before: { prompt: beforeState.prompt, category: beforeState.category, topic: beforeState.topic },
            after: { prompt: afterState.prompt, category: afterState.category, topic: afterState.topic },
          });
        }
      }
      const rows = await this.library(orgId);
      return rows.find(row => row.id === trackingId) ?? null;
    });
  }

  async groups(orgId: string): Promise<PromptTopicGroup[]> {
    const rows = await this.query<{ id: string; topic: string; category: string | null; text: string }>(
      `SELECT t.id,t.name AS topic,c.name AS category,p.text FROM topics t
      JOIN prompts p ON p.topic_id=t.id LEFT JOIN categories c ON c.id=t.category_id WHERE t.organization_id=$1 ORDER BY t.name,p.text`, [orgId]);
    const groups = new Map<string, PromptTopicGroup>();
    for (const row of rows) {
      const key = row.id;
      const group = groups.get(key) ?? { topic: row.topic, category: row.category ?? undefined, prompts: [] };
      group.prompts.push(row.text); groups.set(key, group);
    }
    return [...groups.values()];
  }

  async replaceGroups(orgId: string, groups: PromptTopicGroup[]): Promise<void> {
    await this.transaction(async () => {
      const beforeGroups = await this.groups(orgId);
      const seen = new Set<string>();
      for (const group of groups) for (const text of group.prompts) {
        if (seen.has(normalize(text))) throw new Error("A prompt cannot belong to multiple topic groups");
        seen.add(normalize(text));
      }
      // Preserve category-only assignments when a prompt leaves a group.
      await this.run(`UPDATE prompts SET uncategorized_category_id=(SELECT category_id FROM topics WHERE id=prompts.topic_id),
        topic_id=NULL,updated_at=$1 WHERE organization_id=$2 AND topic_id IS NOT NULL`, [now(), orgId]);
      for (const group of groups) for (const text of group.prompts) await this.upsertPrompt(orgId, { text, category: group.category, topic: group.topic }, true);
      if (!groupsEqual(beforeGroups, groups)) {
        await this.logChange(orgId, {
          entityType: "topic_groups", entityId: orgId, op: "update",
          summary: `토픽 묶음 변경 — ${beforeGroups.length}개 → ${groups.length}개`, before: beforeGroups, after: groups,
        });
      }
    });
  }

  async bridgeScope<T>(orgId: string, scope: string): Promise<Record<string, T>> {
    const rows = await this.query<{ entry_key: string; data_json: unknown }>(
      "SELECT entry_key,data_json FROM bridge_entries WHERE organization_id=$1 AND scope=$2", [orgId, scope]);
    const entries: [string, T][] = [];
    for (const row of rows) {
      const data = row.data_json as T;
      // Older brainstorm files stored strings; expose the current object shape.
      if (scope === "llm-brainstorm" && Array.isArray(data)) {
        for (const [index, card] of (data as unknown[]).entries()) {
          const cardObj = card as Record<string, unknown>;
          cardObj.id ??= `brainstorm-${hash([row.entry_key, index, cardObj.title]).slice(0, 20)}`;
          const topics = (cardObj.topics as unknown[] | undefined) ?? [];
          cardObj.topics = await Promise.all(topics.map(async (item: unknown) => {
            if (typeof item !== "string") return item;
            const prompt = await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2", [orgId, normalize(item)]);
            const existing = prompt ? await this.getPrompt(orgId, prompt.id) : undefined;
            return { prompt: item, category: existing?.category ?? "", topic: existing?.topic ?? "" };
          }));
        }
      }
      entries.push([row.entry_key, data]);
    }
    return Object.fromEntries(entries);
  }

  async putBridge(orgId: string, scope: string, entries: Record<string, unknown>): Promise<void> {
    await this.transaction(async () => {
      await this.ensureOrg(orgId);
      for (const [key, data] of Object.entries(entries)) {
        await this.run(`INSERT INTO bridge_entries VALUES ($1,$2,$3,$4,$5) ON CONFLICT(organization_id,scope,entry_key)
          DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`, [orgId, scope, key, JSON.stringify(data), now()]);
        if (scope === "prompt-topic-groups" && key === "current") await this.replaceGroups(orgId, data as PromptTopicGroup[]);
        const register = async (item: Record<string, unknown>, purpose: string, fallbackReason?: string, sourceKey = key) => {
          if (typeof item.prompt !== "string") return;
          await this.upsertPrompt(orgId, { text: item.prompt, category: typeof item.category === "string" ? item.category : undefined,
            topic: typeof item.topic === "string" ? item.topic : undefined, searchIntent: typeof item.intent === "string" ? item.intent : undefined,
            sourceType: scope, sourceKey, generationPurpose: purpose,
            generationReasoning: typeof item.reasoning === "string" ? item.reasoning : fallbackReason, metadata: { key, ...item } });
        };
        if ((scope === "gsc-keyword-prompts" || scope === "citation-test-prompts") && Array.isArray(data)) {
          for (const item of data) await register(item, scope === "gsc-keyword-prompts" ? "coverage_gap" : "citation_test");
        }
        if ((scope === "llm-brainstorm" || scope === "llm-trend-strategy" || scope === "llm-sitemap-strategy") && Array.isArray(data)) for (const card of data) {
          for (const item of card.topics ?? []) await register(typeof item === "string" ? { prompt: item } : item, card.tag ?? "brainstorm", card.summary,
            `${key}:${card.id ?? hash([card.title, card.summary])}`);
        }
      }
    });
  }

  async importRun(orgId: string, file: CollectedRunFile, jobId: string | null = null): Promise<string> {
    return this.transaction(async () => {
      const run = file.promptRun;
      const existingRun = await this.one<{ organization_id: string; prompt_id: string }>("SELECT organization_id,prompt_id FROM prompt_runs WHERE id=$1", [run.id]);
      if (existingRun && existingRun.organization_id !== orgId) throw new Error("Run belongs to another organization");
      const text = run.rawMetadata.query?.trim();
      if (!text) throw new Error(`Missing prompt text in run ${run.id}`);
      const promptId = existingRun?.prompt_id ?? await this.upsertPrompt(orgId, { text, category: run.rawMetadata.category, topic: run.rawMetadata.topic,
        sourceType: run.rawMetadata.source, sourceKey: run.id, createdAt: run.runAt });
      await this.run(`INSERT INTO prompt_runs VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT(id) DO UPDATE SET job_id=coalesce(excluded.job_id,prompt_runs.job_id),status=excluded.status,
        raw_response=excluded.raw_response,error_message=excluded.error_message,original_json=excluded.original_json`,
        [run.id, orgId, promptId, jobId, text, run.rawMetadata.source, run.llmModelId, run.marketId, run.rawMetadata.locale ?? null,
          run.runAt, run.status, run.rawResponse, run.rawMetadata.errorMessage ?? null, JSON.stringify(run), file.dir, file.filename]);
      return promptId;
    });
  }

  async runs(orgId: string): Promise<CollectedRunFile[]> {
    const rows = await this.query<Record<string, unknown>>(`SELECT r.*,p.topic_id,t.name AS topic,c.name AS category FROM prompt_runs r
      JOIN prompts p ON p.id=r.prompt_id LEFT JOIN topics t ON t.id=p.topic_id
      LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      WHERE r.organization_id=$1 ORDER BY r.run_at DESC`, [orgId]);
    return rows.map(row => {
      const run = row.original_json as PromptRunSeed;
      return { dir: row.source_dir as string, filename: row.source_filename as string,
        promptRun: { ...run, promptId: row.prompt_id as string, rawMetadata: { ...run.rawMetadata,
          category: row.category as string | undefined ?? undefined, topic: row.topic as string | undefined ?? undefined } } };
    });
  }

  // Same result as calling analyze() per run, but fetches every already-cached
  // result in one round trip instead of one SELECT per run — the common case
  // once a run has been analyzed at least once (e.g. every page that renders
  // real stats from a large run history).
  async analyzeMany(runs: PromptRunSeed[], brands: BrandSeed[]): Promise<{ mentions: ReturnType<typeof extractMentionsFromRun>; citations: ReturnType<typeof extractCitationsFromRun> }[]> {
    const successful = runs.filter(run => run.status === "success");
    const inputHashByRun = new Map(successful.map(run => [run.id, hash([run.rawResponse, run.rawMetadata.citations, brands])]));
    const cachedRows = successful.length
      ? await this.query<{ run_id: string; input_hash: string; result_json: unknown }>(
          "SELECT run_id,input_hash,result_json FROM run_analyses WHERE version=$1 AND status='success' AND run_id = ANY($2)",
          [ANALYSIS_VERSION, successful.map(run => run.id)])
      : [];
    const cacheByRun = new Map(cachedRows.map(row => [row.run_id, row]));
    return Promise.all(successful.map(run => {
      const cached = cacheByRun.get(run.id);
      if (cached && cached.input_hash === inputHashByRun.get(run.id)) {
        return cached.result_json as { mentions: ReturnType<typeof extractMentionsFromRun>; citations: ReturnType<typeof extractCitationsFromRun> };
      }
      return this.analyze(run, brands);
    }));
  }

  async analyze(run: PromptRunSeed, brands: BrandSeed[]): Promise<{ mentions: ReturnType<typeof extractMentionsFromRun>; citations: ReturnType<typeof extractCitationsFromRun> }> {
    if (run.status !== "success") throw new Error("Only successful runs can be analyzed");
    const inputHash = hash([run.rawResponse, run.rawMetadata.citations, brands]);
    const cached = await this.one<{ result_json: unknown }>(
      "SELECT result_json FROM run_analyses WHERE run_id=$1 AND version=$2 AND input_hash=$3 AND status='success'", [run.id, ANALYSIS_VERSION, inputHash]);
    if (cached) return cached.result_json as { mentions: ReturnType<typeof extractMentionsFromRun>; citations: ReturnType<typeof extractCitationsFromRun> };
    const analysisId = `analysis-${hash([run.id, ANALYSIS_VERSION, inputHash])}`;
    try {
      return await this.transaction(async () => {
        const mentions = extractMentionsFromRun(run, brands);
        const citations = extractCitationsFromRun(run, brands);
        await this.run(`INSERT INTO run_analyses VALUES ($1,$2,$3,$4,$5,'success',$6,NULL,$7)
          ON CONFLICT(id) DO UPDATE SET status='success',error_message=NULL,result_json=excluded.result_json,analyzed_at=excluded.analyzed_at`,
          [analysisId, run.id, ANALYSIS_VERSION, inputHash, "keyword_heuristic", now(), JSON.stringify({ mentions, citations })]);
        for (const mention of mentions) {
          const brand = brands.find(b => b.id === mention.brandId)!;
          const normalized = run.rawResponse.toLowerCase();
          const offsets = [brand.name, brand.domain, ...brand.aliases].filter(Boolean).map(value => normalized.indexOf(value.toLowerCase())).filter(value => value >= 0);
          const offset = offsets.length ? Math.min(...offsets) : -1;
          const evidence = offset >= 0 ? run.rawResponse.slice(Math.max(0, offset - 180), offset + 360) : null;
          const score = !mention.isPresent ? null : mention.sentiment === "neutral" ? 0 : Number((mention.sentimentScore * 2 - 1).toFixed(4));
          await this.run("INSERT INTO brand_observations VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8) ON CONFLICT DO NOTHING",
            [analysisId, brand.id, JSON.stringify(brand), mention.isPresent, mention.position,
              mention.isPresent ? mention.sentiment : null, score, evidence]);
        }
        for (const [index, citation] of citations.entries()) await this.run("INSERT INTO citations VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [`${analysisId}-${index}`, analysisId, citation.brandId, citation.pageUrl, citation.domain, citation.title, index + 1, citation.isOwnDomain]);
        return { mentions, citations };
      });
    } catch (error) {
      await this.run(`INSERT INTO run_analyses VALUES ($1,$2,$3,$4,$5,'failed',$6,$7,NULL)
        ON CONFLICT(id) DO UPDATE SET status='failed',error_message=excluded.error_message,analyzed_at=excluded.analyzed_at`,
        [analysisId, run.id, ANALYSIS_VERSION, inputHash, "keyword_heuristic", now(), error instanceof Error ? error.message : String(error)]);
      throw error;
    }
  }

  private toBrand(row: Record<string, unknown>): ManagedBrand {
    // otherBrands used to be a plain string[] before per-brand aliases were
    // added — coerce old rows so a stale DB never crashes the UI.
    const otherBrands = (row.other_brands_json as unknown[]).map((entry) =>
      typeof entry === "string" ? { name: entry, aliases: [] } : (entry as { name: string; aliases: string[] })
    );
    return {
      id: row.id as string, organizationId: row.organization_id as string, name: row.name as string,
      url: row.url as string, sitemapUrl: row.sitemap_url as string, description: row.description as string,
      industry: row.industry as string, status: row.status as ManagedBrand["status"],
      markets: row.markets_json as string[], aliases: row.aliases_json as string[],
      otherBrands, urls: row.urls_json as string[],
      socialAccounts: row.social_accounts_json as ManagedBrand["socialAccounts"], earnedContentSources: row.earned_content_sources_json as string[],
      cdnConnected: !!row.cdn_connected, gscConnected: !!row.gsc_connected, analyticsConnected: !!row.analytics_connected,
    };
  }

  async listBrands(orgId: string): Promise<ManagedBrand[]> {
    const rows = await this.query("SELECT * FROM brands WHERE organization_id=$1 ORDER BY created_at", [orgId]);
    return rows.map(row => this.toBrand(row));
  }

  async getBrand(orgId: string, brandId: string): Promise<ManagedBrand | null> {
    const row = await this.one("SELECT * FROM brands WHERE organization_id=$1 AND id=$2", [orgId, brandId]);
    return row ? this.toBrand(row) : null;
  }

  async createBrand(orgId: string, brand: Omit<ManagedBrand, "id" | "organizationId">, brandId?: string): Promise<ManagedBrand> {
    return this.transaction(async () => {
      await this.ensureOrg(orgId);
      const newId = brandId ?? id("brand");
      const at = now();
      await this.run(`INSERT INTO brands VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [
        newId, orgId, brand.name, brand.url, brand.sitemapUrl, brand.description, brand.industry, brand.status,
        JSON.stringify(brand.markets), JSON.stringify(brand.aliases), JSON.stringify(brand.otherBrands),
        JSON.stringify(brand.urls), JSON.stringify(brand.socialAccounts), JSON.stringify(brand.earnedContentSources),
        brand.cdnConnected, brand.gscConnected, brand.analyticsConnected, at, at]);
      const created = (await this.getBrand(orgId, newId))!;
      await this.logChange(orgId, { brandId: newId, entityType: "brand", entityId: newId, op: "create", summary: `브랜드 추가 — ${brand.name}`, after: { name: brand.name, url: brand.url } });
      return created;
    });
  }

  async updateBrand(orgId: string, brandId: string, patch: Partial<Omit<ManagedBrand, "id" | "organizationId">>): Promise<ManagedBrand | null> {
    return this.transaction(async () => {
      const existing = await this.getBrand(orgId, brandId);
      if (!existing) return null;
      const merged = { ...existing, ...patch };
      await this.run(`UPDATE brands SET name=$1,url=$2,sitemap_url=$3,description=$4,industry=$5,status=$6,
        markets_json=$7,aliases_json=$8,other_brands_json=$9,urls_json=$10,social_accounts_json=$11,earned_content_sources_json=$12,
        cdn_connected=$13,gsc_connected=$14,analytics_connected=$15,updated_at=$16 WHERE organization_id=$17 AND id=$18`, [
        merged.name, merged.url, merged.sitemapUrl, merged.description, merged.industry, merged.status,
        JSON.stringify(merged.markets), JSON.stringify(merged.aliases), JSON.stringify(merged.otherBrands),
        JSON.stringify(merged.urls), JSON.stringify(merged.socialAccounts), JSON.stringify(merged.earnedContentSources),
        merged.cdnConnected, merged.gscConnected, merged.analyticsConnected, now(), orgId, brandId]);
      const diff = diffFields(existing as unknown as Record<string, unknown>, merged as unknown as Record<string, unknown>);
      if (diff) {
        await this.logChange(orgId, { brandId, entityType: "brand", entityId: brandId, op: "update", summary: brandChangeSummary(diff.changed), before: diff.before, after: diff.after });
      }
      return this.getBrand(orgId, brandId);
    });
  }

  async deleteBrand(orgId: string, brandId: string): Promise<boolean> {
    // detected_brand_decisions는 brands를 ON DELETE CASCADE 없이 참조하므로 먼저 지운다 — 안 그러면 브랜드 최적화·제외 기록이
    // 있는 브랜드는 FK 위반(500)으로 삭제되지 않는다.
    return this.transaction(async () => {
      const existing = await this.getBrand(orgId, brandId);
      await this.run("DELETE FROM detected_brand_decisions WHERE organization_id=$1 AND brand_id=$2", [orgId, brandId]);
      const deleted = (await this.run("DELETE FROM brands WHERE organization_id=$1 AND id=$2", [orgId, brandId])) > 0;
      if (deleted && existing) {
        await this.logChange(orgId, { brandId: null, entityType: "brand", entityId: brandId, op: "delete", summary: `브랜드 삭제 — ${existing.name}`, before: existing });
      }
      return deleted;
    });
  }

  async listDetectedBrandDecisions(orgId: string, brandId: string): Promise<Map<string, { status: "approved" | "excluded"; evidenceDomain?: string }>> {
    const rows = await this.query<{ normalized_name: string; status: "approved" | "excluded"; evidence_domain: string | null }>(
      "SELECT normalized_name,status,evidence_domain FROM detected_brand_decisions WHERE organization_id=$1 AND brand_id=$2", [orgId, brandId]);
    return new Map(
      rows.map((row) => [row.normalized_name, { status: row.status, evidenceDomain: row.evidence_domain ?? undefined }])
    );
  }

  /** 사이트맵 크롤 한 번의 결과 — 같은 (조직, 도메인, 크롤 시각)은 덮어쓴다(같은 결과를 다시 올려도 중복되지 않는다). */
  async saveSitemapCrawl(orgId: string, result: SitemapCrawlResult, sourceJobId: string | null = null): Promise<void> {
    await this.ensureOrg(orgId);
    await this.run(
      `INSERT INTO sitemap_crawls VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(organization_id,domain,crawled_at)
      DO UPDATE SET sitemap_url=excluded.sitemap_url,source_job_id=excluded.source_job_id,data_json=excluded.data_json`,
      [id("crawl"), orgId, result.domain, result.sitemapUrl, result.crawledAt, sourceJobId, JSON.stringify(result), now()]
    );
  }

  /** 이 조직의 한 도메인 크롤 기록 — 크롤 시각 오름차순. */
  async sitemapCrawls(orgId: string, domain: string): Promise<SitemapCrawlResult[]> {
    const rows = await this.query<{ data_json: SitemapCrawlResult }>(
      "SELECT data_json FROM sitemap_crawls WHERE organization_id=$1 AND lower(domain)=lower($2) ORDER BY crawled_at ASC",
      [orgId, domain]
    );
    return rows.map((row) => row.data_json);
  }

  async setDetectedBrandDecision(
    orgId: string,
    brandId: string,
    params: { name: string; status: "approved" | "excluded"; evidenceDomain?: string | null }
  ): Promise<void> {
    await this.ensureOrg(orgId);
    const normalizedName = normalize(params.name);
    const at = now();
    await this.run(
      `INSERT INTO detected_brand_decisions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(organization_id,brand_id,normalized_name)
      DO UPDATE SET name=excluded.name,status=excluded.status,evidence_domain=excluded.evidence_domain,updated_at=excluded.updated_at`,
      [id("decision"), orgId, brandId, params.name.trim(), normalizedName, params.status, params.evidenceDomain ?? null, at, at]
    );
  }

  async clearDetectedBrandDecision(orgId: string, brandId: string, name: string): Promise<void> {
    await this.run("DELETE FROM detected_brand_decisions WHERE organization_id=$1 AND brand_id=$2 AND normalized_name=$3", [orgId, brandId, normalize(name)]);
  }
}
