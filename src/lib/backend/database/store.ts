import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { BrandSeed, ManagedBrand, PromptLibraryRow, PromptRunSeed, PromptTopicGroup } from "../../db/types";
import type { CollectedRunFile } from "../collectionRunsTypes";
import { extractMentionsFromRun } from "../processing/mentions";
import { extractCitationsFromRun } from "../processing/citations";
import { schema } from "./schema";

export const normalize = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const label = (value?: string) => value && value.trim() !== "—" ? value.trim() : "";
export const ANALYSIS_VERSION = "keyword-heuristic-v1";

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

  async ensureOrg(orgId: string): Promise<void> {
    await this.run("INSERT INTO organizations VALUES ($1,$2) ON CONFLICT DO NOTHING", [orgId, orgId]);
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
      const existing = await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2", [orgId, normalize(input.text)]);
      const promptId = existing?.id ?? id("prompt");
      if (!existing) {
        await this.run(`INSERT INTO prompts(id,organization_id,text,normalized_text,created_by,updated_by,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [promptId, orgId, input.text.trim(), normalize(input.text), input.actorId ?? null, input.actorId ?? null, input.createdAt ?? now(), input.createdAt ?? now()]);
      }
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

  async track(orgId: string, input: PromptInput, options: {
    brandId: string; origin: PromptLibraryRow["origin"]; legacyId?: string; addedAt?: string;
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
      if (options.legacyId) await this.run("INSERT INTO legacy_library_ids VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [orgId, options.legacyId, trackingId]);
      const rows = await this.library(orgId, options.brandId);
      return rows.find(row => row.id === trackingId)!;
    });
  }

  async library(orgId: string, brandId?: string): Promise<PromptLibraryRow[]> {
    const rows = await this.query(`SELECT tr.id,tr.prompt_id AS "promptId",p.text AS prompt,tr.origin,
      coalesce(c.name,'') AS category,coalesce(t.name,'—') AS topic,p.updated_at AS "lastModifiedAt",
      a.display_name AS "lastModifiedBy",tr.added_at AS "addedAt",aa.display_name AS "addedBy",
      p.search_intent AS "searchIntent",tr.status AS "trackingStatus"
      FROM prompt_tracking tr JOIN prompts p ON p.id=tr.prompt_id
      LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      LEFT JOIN actors a ON a.id=p.updated_by LEFT JOIN actors aa ON aa.id=tr.added_by
      WHERE tr.organization_id=$1 AND tr.status='active' AND ($2::text IS NULL OR tr.brand_id=$2) ORDER BY tr.added_at DESC,tr.id`,
      [orgId, brandId ?? null]);
    return rows.map(row => ({ ...row })) as unknown as PromptLibraryRow[];
  }

  async setTrackingStatus(orgId: string, trackingId: string, status: "active" | "paused" | "archived"): Promise<boolean> {
    return this.transaction(async () => {
      const row = await this.one<{ id: string }>(`SELECT id FROM prompt_tracking WHERE organization_id=$1 AND
        (id=$2 OR id IN (SELECT tracking_id FROM legacy_library_ids WHERE organization_id=$1 AND legacy_id=$2))`, [orgId, trackingId]);
      if (!row) return false;
      const at = now();
      await this.run("UPDATE prompt_tracking SET status=$1,paused_at=$2,archived_at=$3,updated_at=$4 WHERE id=$5",
        [status, status === "paused" ? at : null, status === "archived" ? at : null, at, row.id]);
      await this.run("INSERT INTO tracking_events VALUES ($1,$2,$3,NULL,$4)", [id("event"), row.id, status, at]);
      return true;
    });
  }

  async updateLibrary(orgId: string, trackingId: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "topic">): Promise<PromptLibraryRow | null> {
    return this.transaction(async () => {
      const tracking = await this.one<{ prompt_id: string }>("SELECT prompt_id FROM prompt_tracking WHERE organization_id=$1 AND id=$2", [orgId, trackingId]);
      if (!tracking) return null;
      if (!normalize(patch.prompt)) throw new Error("Prompt text is required");
      const duplicate = await this.one<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2 AND id<>$3",
        [orgId, normalize(patch.prompt), tracking.prompt_id]);
      if (duplicate) throw new Error("An identical prompt already exists");
      await this.run("UPDATE prompts SET text=$1,normalized_text=$2,updated_at=$3 WHERE id=$4", [patch.prompt.trim(), normalize(patch.prompt), now(), tracking.prompt_id]);
      await this.classify(orgId, tracking.prompt_id, patch.category, patch.topic);
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
      const seen = new Set<string>();
      for (const group of groups) for (const text of group.prompts) {
        if (seen.has(normalize(text))) throw new Error("A prompt cannot belong to multiple topic groups");
        seen.add(normalize(text));
      }
      // Preserve category-only assignments when a prompt leaves a group.
      await this.run(`UPDATE prompts SET uncategorized_category_id=(SELECT category_id FROM topics WHERE id=prompts.topic_id),
        topic_id=NULL,updated_at=$1 WHERE organization_id=$2 AND topic_id IS NOT NULL`, [now(), orgId]);
      for (const group of groups) for (const text of group.prompts) await this.upsertPrompt(orgId, { text, category: group.category, topic: group.topic }, true);
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
        if (scope === "llm-brainstorm" && Array.isArray(data)) for (const card of data) {
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
      return (await this.getBrand(orgId, newId))!;
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
      return this.getBrand(orgId, brandId);
    });
  }

  async deleteBrand(orgId: string, brandId: string): Promise<boolean> {
    return (await this.run("DELETE FROM brands WHERE organization_id=$1 AND id=$2", [orgId, brandId])) > 0;
  }

  listDetectedBrandDecisions(orgId: string, brandId: string): Map<string, { status: "approved" | "excluded"; evidenceDomain?: string }> {
    const rows = this.sql.prepare("SELECT normalized_name,status,evidence_domain FROM detected_brand_decisions WHERE organization_id=? AND brand_id=?").all(orgId, brandId);
    return new Map(
      rows.map((row) => [
        row.normalized_name as string,
        { status: row.status as "approved" | "excluded", evidenceDomain: (row.evidence_domain as string | null) ?? undefined },
      ])
    );
  }

  setDetectedBrandDecision(
    orgId: string,
    brandId: string,
    params: { name: string; status: "approved" | "excluded"; evidenceDomain?: string | null }
  ): void {
    this.ensureOrg(orgId);
    const normalizedName = normalize(params.name);
    const at = now();
    this.sql
      .prepare(
        `INSERT INTO detected_brand_decisions VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(organization_id,brand_id,normalized_name)
        DO UPDATE SET name=excluded.name,status=excluded.status,evidence_domain=excluded.evidence_domain,updated_at=excluded.updated_at`
      )
      .run(id("decision"), orgId, brandId, params.name.trim(), normalizedName, params.status, params.evidenceDomain ?? null, at, at);
  }

  clearDetectedBrandDecision(orgId: string, brandId: string, name: string): void {
    this.sql.prepare("DELETE FROM detected_brand_decisions WHERE organization_id=? AND brand_id=? AND normalized_name=?").run(orgId, brandId, normalize(name));
  }
}
