import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
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

export class PromptStore {
  readonly sql: DatabaseSync;
  private depth = 0;

  constructor(filename: string) {
    if (filename !== ":memory:") mkdirSync(path.dirname(filename), { recursive: true });
    this.sql = new DatabaseSync(filename);
    this.sql.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.transaction(() => {
      this.sql.exec(schema);
      this.sql.prepare("INSERT OR IGNORE INTO schema_migrations VALUES (1,?)").run(now());
    });
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.sql.exec("BEGIN IMMEDIATE");
    this.depth++;
    try { const value = fn(); this.sql.exec("COMMIT"); return value; }
    catch (error) { this.sql.exec("ROLLBACK"); throw error; }
    finally { this.depth--; }
  }

  ensureOrg(orgId: string) {
    this.sql.prepare("INSERT OR IGNORE INTO organizations VALUES (?,?)").run(orgId, orgId);
  }

  legacyActor(orgId: string, displayName: string | null) {
    if (!displayName) return null;
    const actorId = `legacy-${hash([orgId, displayName]).slice(0, 24)}`;
    this.sql.prepare("INSERT OR IGNORE INTO actors VALUES (?,?,?,'legacy')").run(actorId, orgId, displayName);
    return actorId;
  }

  category(orgId: string, name: string) {
    this.ensureOrg(orgId);
    const key = normalize(name);
    const existing = this.sql.prepare("SELECT id FROM categories WHERE organization_id=? AND normalized_name=?").get(orgId, key);
    if (existing) return existing.id as string;
    const categoryId = id("category");
    this.sql.prepare("INSERT INTO categories VALUES (?,?,?,?,?,?)").run(categoryId, orgId, name.trim(), key, now(), now());
    return categoryId;
  }

  private topic(orgId: string, name: string, categoryId: string | null) {
    const existing = this.sql.prepare("SELECT id FROM topics WHERE organization_id=? AND category_id IS ? AND normalized_name=?").get(orgId, categoryId, normalize(name));
    if (existing) return existing.id as string;
    const topicId = id("topic");
    this.sql.prepare("INSERT INTO topics VALUES (?,?,?,?,?,?,?)").run(topicId, orgId, categoryId, name.trim(), normalize(name), now(), now());
    return topicId;
  }

  getPrompt(orgId: string, promptId: string): PromptRecord | undefined {
    return this.sql.prepare(`SELECT p.*,t.name AS topic,c.name AS category FROM prompts p
      LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      WHERE p.organization_id=? AND p.id=?`).get(orgId, promptId) as unknown as PromptRecord | undefined;
  }

  upsertPrompt(orgId: string, input: PromptInput, replaceClassification = false): string {
    return this.transaction(() => {
      if (!normalize(input.text)) throw new Error("Prompt text is required");
      this.ensureOrg(orgId);
      const existing = this.sql.prepare("SELECT id FROM prompts WHERE organization_id=? AND normalized_text=?").get(orgId, normalize(input.text));
      const promptId = existing?.id as string | undefined ?? id("prompt");
      if (!existing) {
        this.sql.prepare(`INSERT INTO prompts(id,organization_id,text,normalized_text,created_by,updated_by,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?)`).run(promptId, orgId, input.text.trim(), normalize(input.text), input.actorId ?? null, input.actorId ?? null, input.createdAt ?? now(), input.createdAt ?? now());
      }
      if (!existing || replaceClassification) this.classify(orgId, promptId, input.category, input.topic);
      if (input.searchIntent) this.sql.prepare("UPDATE prompts SET search_intent=? WHERE id=?").run(input.searchIntent, promptId);
      if (input.sourceType) {
        this.sql.prepare(`INSERT INTO prompt_sources VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(prompt_id,source_type,source_key) DO UPDATE SET
          generation_purpose=coalesce(excluded.generation_purpose,prompt_sources.generation_purpose),
          generation_reasoning=coalesce(excluded.generation_reasoning,prompt_sources.generation_reasoning),metadata_json=excluded.metadata_json`)
          .run(id("source"), promptId, input.sourceType, input.sourceKey ?? "", input.generationPurpose ?? null,
            input.generationReasoning ?? null, JSON.stringify(input.metadata ?? {}), input.createdAt ?? now());
      }
      return promptId;
    });
  }

  private classify(orgId: string, promptId: string, category?: string, topic?: string) {
    const categoryId = label(category) ? this.category(orgId, label(category)) : null;
    const topicId = label(topic) ? this.topic(orgId, label(topic), categoryId) : null;
    this.sql.prepare("UPDATE prompts SET topic_id=?,uncategorized_category_id=?,updated_at=? WHERE organization_id=? AND id=?")
      .run(topicId, topicId ? null : categoryId, now(), orgId, promptId);
  }

  track(orgId: string, input: PromptInput, options: {
    brandId: string; origin: PromptLibraryRow["origin"]; legacyId?: string; addedAt?: string;
  }): PromptLibraryRow {
    return this.transaction(() => {
      const promptId = this.upsertPrompt(orgId, input);
      const existing = this.sql.prepare("SELECT id,status FROM prompt_tracking WHERE organization_id=? AND prompt_id=? AND brand_id=?")
        .get(orgId, promptId, options.brandId);
      const trackingId = existing?.id as string | undefined ?? options.legacyId ?? `tracked-${Date.now()}-${randomUUID().replaceAll("-", "")}`;
      const at = options.addedAt ?? now();
      if (!existing) {
        this.sql.prepare("INSERT INTO prompt_tracking VALUES (?,?,?,?,'active',?,?,?,NULL,NULL,?)")
          .run(trackingId, orgId, promptId, options.brandId, options.origin, at, input.actorId ?? null, at);
      } else if (existing.status !== "active") {
        this.sql.prepare("UPDATE prompt_tracking SET status='active',paused_at=NULL,archived_at=NULL,updated_at=? WHERE id=?").run(at, trackingId);
      }
      if (!existing || existing.status !== "active") this.sql.prepare("INSERT INTO tracking_events VALUES (?,?,'active',?,?)").run(id("event"), trackingId, input.actorId ?? null, at);
      if (options.legacyId) this.sql.prepare("INSERT OR IGNORE INTO legacy_library_ids VALUES (?,?,?)").run(orgId, options.legacyId, trackingId);
      return this.library(orgId, options.brandId).find(row => row.id === trackingId)!;
    });
  }

  library(orgId: string, brandId?: string): PromptLibraryRow[] {
    const rows = this.sql.prepare(`SELECT tr.id,tr.prompt_id AS promptId,p.text AS prompt,tr.origin,
      coalesce(c.name,'') AS category,coalesce(t.name,'—') AS topic,p.updated_at AS lastModifiedAt,
      a.display_name AS lastModifiedBy,tr.added_at AS addedAt,aa.display_name AS addedBy,
      p.search_intent AS searchIntent,tr.status AS trackingStatus
      FROM prompt_tracking tr JOIN prompts p ON p.id=tr.prompt_id
      LEFT JOIN topics t ON t.id=p.topic_id LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      LEFT JOIN actors a ON a.id=p.updated_by LEFT JOIN actors aa ON aa.id=tr.added_by
      WHERE tr.organization_id=? AND tr.status='active' AND (? IS NULL OR tr.brand_id=?) ORDER BY tr.added_at DESC,tr.id`)
      .all(orgId, brandId ?? null, brandId ?? null);
    return rows.map(row => ({ ...row })) as unknown as PromptLibraryRow[];
  }

  setTrackingStatus(orgId: string, trackingId: string, status: "active" | "paused" | "archived") {
    return this.transaction(() => {
      const row = this.sql.prepare(`SELECT id FROM prompt_tracking WHERE organization_id=? AND
        (id=? OR id IN (SELECT tracking_id FROM legacy_library_ids WHERE organization_id=? AND legacy_id=?))`).get(orgId, trackingId, orgId, trackingId);
      if (!row) return false;
      const at = now();
      this.sql.prepare("UPDATE prompt_tracking SET status=?,paused_at=?,archived_at=?,updated_at=? WHERE id=?")
        .run(status, status === "paused" ? at : null, status === "archived" ? at : null, at, row.id);
      this.sql.prepare("INSERT INTO tracking_events VALUES (?,?,?,NULL,?)").run(id("event"), row.id, status, at);
      return true;
    });
  }

  updateLibrary(orgId: string, trackingId: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "topic">) {
    return this.transaction(() => {
      const tracking = this.sql.prepare("SELECT prompt_id FROM prompt_tracking WHERE organization_id=? AND id=?").get(orgId, trackingId);
      if (!tracking) return null;
      if (!normalize(patch.prompt)) throw new Error("Prompt text is required");
      const duplicate = this.sql.prepare("SELECT id FROM prompts WHERE organization_id=? AND normalized_text=? AND id<>?").get(orgId, normalize(patch.prompt), tracking.prompt_id);
      if (duplicate) throw new Error("An identical prompt already exists");
      this.sql.prepare("UPDATE prompts SET text=?,normalized_text=?,updated_at=? WHERE id=?").run(patch.prompt.trim(), normalize(patch.prompt), now(), tracking.prompt_id);
      this.classify(orgId, tracking.prompt_id as string, patch.category, patch.topic);
      return this.library(orgId).find(row => row.id === trackingId) ?? null;
    });
  }

  groups(orgId: string): PromptTopicGroup[] {
    const rows = this.sql.prepare(`SELECT t.id,t.name AS topic,c.name AS category,p.text FROM topics t
      JOIN prompts p ON p.topic_id=t.id LEFT JOIN categories c ON c.id=t.category_id WHERE t.organization_id=? ORDER BY t.name,p.text`).all(orgId);
    const groups = new Map<string, PromptTopicGroup>();
    for (const row of rows) {
      const key = row.id as string;
      const group = groups.get(key) ?? { topic: row.topic as string, category: row.category as string | undefined, prompts: [] };
      group.prompts.push(row.text as string); groups.set(key, group);
    }
    return [...groups.values()];
  }

  replaceGroups(orgId: string, groups: PromptTopicGroup[]) {
    this.transaction(() => {
      const seen = new Set<string>();
      for (const group of groups) for (const text of group.prompts) {
        if (seen.has(normalize(text))) throw new Error("A prompt cannot belong to multiple topic groups");
        seen.add(normalize(text));
      }
      // Preserve category-only assignments when a prompt leaves a group.
      this.sql.prepare(`UPDATE prompts SET uncategorized_category_id=(SELECT category_id FROM topics WHERE id=prompts.topic_id),
        topic_id=NULL,updated_at=? WHERE organization_id=? AND topic_id IS NOT NULL`).run(now(), orgId);
      for (const group of groups) for (const text of group.prompts) this.upsertPrompt(orgId, { text, category: group.category, topic: group.topic }, true);
    });
  }

  bridgeScope<T>(orgId: string, scope: string): Record<string, T> {
    return Object.fromEntries(this.sql.prepare("SELECT entry_key,data_json FROM bridge_entries WHERE organization_id=? AND scope=?").all(orgId, scope)
      .map(row => {
        const data = JSON.parse(row.data_json as string);
        // Older brainstorm files stored strings; expose the current object shape.
        if (scope === "llm-brainstorm" && Array.isArray(data)) {
          for (const [index, card] of data.entries()) {
            card.id ??= `brainstorm-${hash([row.entry_key, index, card.title]).slice(0, 20)}`;
            card.topics = (card.topics ?? []).map((item: unknown) => {
              if (typeof item !== "string") return item;
              const prompt = this.sql.prepare("SELECT id FROM prompts WHERE organization_id=? AND normalized_text=?").get(orgId, normalize(item));
              const existing = prompt ? this.getPrompt(orgId, prompt.id as string) : undefined;
              return { prompt: item, category: existing?.category ?? "", topic: existing?.topic ?? "" };
            });
          }
        }
        return [row.entry_key, data];
      }));
  }

  putBridge(orgId: string, scope: string, entries: Record<string, unknown>) {
    this.transaction(() => {
      this.ensureOrg(orgId);
      for (const [key, data] of Object.entries(entries)) {
        this.sql.prepare(`INSERT INTO bridge_entries VALUES (?,?,?,?,?) ON CONFLICT(organization_id,scope,entry_key)
          DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`).run(orgId, scope, key, JSON.stringify(data), now());
        if (scope === "prompt-topic-groups" && key === "current") this.replaceGroups(orgId, data as PromptTopicGroup[]);
        const register = (item: Record<string, unknown>, purpose: string, fallbackReason?: string, sourceKey = key) => {
          if (typeof item.prompt !== "string") return;
          this.upsertPrompt(orgId, { text: item.prompt, category: typeof item.category === "string" ? item.category : undefined,
            topic: typeof item.topic === "string" ? item.topic : undefined, searchIntent: typeof item.intent === "string" ? item.intent : undefined,
            sourceType: scope, sourceKey, generationPurpose: purpose,
            generationReasoning: typeof item.reasoning === "string" ? item.reasoning : fallbackReason, metadata: { key, ...item } });
        };
        if ((scope === "gsc-keyword-prompts" || scope === "citation-test-prompts") && Array.isArray(data)) {
          for (const item of data) register(item, scope === "gsc-keyword-prompts" ? "coverage_gap" : "citation_test");
        }
        if (scope === "llm-brainstorm" && Array.isArray(data)) for (const card of data) {
          for (const item of card.topics ?? []) register(typeof item === "string" ? { prompt: item } : item, card.tag ?? "brainstorm", card.summary,
            `${key}:${card.id ?? hash([card.title, card.summary])}`);
        }
      }
    });
  }

  importRun(orgId: string, file: CollectedRunFile, jobId: string | null = null) {
    return this.transaction(() => {
      const run = file.promptRun;
      const existingRun = this.sql.prepare("SELECT organization_id,prompt_id FROM prompt_runs WHERE id=?").get(run.id);
      if (existingRun && existingRun.organization_id !== orgId) throw new Error("Run belongs to another organization");
      const text = run.rawMetadata.query?.trim();
      if (!text) throw new Error(`Missing prompt text in run ${run.id}`);
      const promptId = existingRun?.prompt_id as string | undefined ?? this.upsertPrompt(orgId, { text, category: run.rawMetadata.category, topic: run.rawMetadata.topic,
        sourceType: run.rawMetadata.source, sourceKey: run.id, createdAt: run.runAt });
      this.sql.prepare(`INSERT INTO prompt_runs VALUES (?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET job_id=coalesce(excluded.job_id,prompt_runs.job_id),status=excluded.status,
        raw_response=excluded.raw_response,error_message=excluded.error_message,original_json=excluded.original_json`)
        .run(run.id, orgId, promptId, jobId, text, run.rawMetadata.source, run.llmModelId, run.marketId, run.rawMetadata.locale ?? null,
          run.runAt, run.status, run.rawResponse, run.rawMetadata.errorMessage ?? null, JSON.stringify(run), file.dir, file.filename);
      return promptId;
    });
  }

  runs(orgId: string): CollectedRunFile[] {
    return this.sql.prepare(`SELECT r.*,p.topic_id,t.name AS topic,c.name AS category FROM prompt_runs r
      JOIN prompts p ON p.id=r.prompt_id LEFT JOIN topics t ON t.id=p.topic_id
      LEFT JOIN categories c ON c.id=coalesce(t.category_id,p.uncategorized_category_id)
      WHERE r.organization_id=? ORDER BY r.run_at DESC`).all(orgId).map(row => {
        const run = JSON.parse(row.original_json as string) as PromptRunSeed;
        return { dir: row.source_dir as string, filename: row.source_filename as string,
          promptRun: { ...run, promptId: row.prompt_id as string, rawMetadata: { ...run.rawMetadata,
            category: row.category as string | undefined ?? undefined, topic: row.topic as string | undefined ?? undefined } } };
      });
  }

  analyze(run: PromptRunSeed, brands: BrandSeed[]) {
    if (run.status !== "success") throw new Error("Only successful runs can be analyzed");
    const inputHash = hash([run.rawResponse, run.rawMetadata.citations, brands]);
    const cached = this.sql.prepare("SELECT result_json FROM run_analyses WHERE run_id=? AND version=? AND input_hash=? AND status='success'")
      .get(run.id, ANALYSIS_VERSION, inputHash);
    if (cached) return JSON.parse(cached.result_json as string) as { mentions: ReturnType<typeof extractMentionsFromRun>; citations: ReturnType<typeof extractCitationsFromRun> };
    const analysisId = `analysis-${hash([run.id, ANALYSIS_VERSION, inputHash])}`;
    try {
      return this.transaction(() => {
      const mentions = extractMentionsFromRun(run, brands);
      const citations = extractCitationsFromRun(run, brands);
      this.sql.prepare(`INSERT INTO run_analyses VALUES (?,?,?,?,?,'success',?,NULL,?)
        ON CONFLICT(id) DO UPDATE SET status='success',error_message=NULL,result_json=excluded.result_json,analyzed_at=excluded.analyzed_at`)
        .run(analysisId, run.id, ANALYSIS_VERSION, inputHash, "keyword_heuristic", now(), JSON.stringify({ mentions, citations }));
      for (const mention of mentions) {
        const brand = brands.find(b => b.id === mention.brandId)!;
        const normalized = run.rawResponse.toLowerCase();
        const offsets = [brand.name, brand.domain, ...brand.aliases].filter(Boolean).map(value => normalized.indexOf(value.toLowerCase())).filter(value => value >= 0);
        const offset = offsets.length ? Math.min(...offsets) : -1;
        const evidence = offset >= 0 ? run.rawResponse.slice(Math.max(0, offset - 180), offset + 360) : null;
        const score = !mention.isPresent ? null : mention.sentiment === "neutral" ? 0 : Number((mention.sentimentScore * 2 - 1).toFixed(4));
        this.sql.prepare("INSERT OR IGNORE INTO brand_observations VALUES (?,?,?,?,?,NULL,?,?,?)")
          .run(analysisId, brand.id, JSON.stringify(brand), Number(mention.isPresent), mention.position,
            mention.isPresent ? mention.sentiment : null, score, evidence);
      }
      for (const [index, citation] of citations.entries()) this.sql.prepare("INSERT OR IGNORE INTO citations VALUES (?,?,?,?,?,?,?,?)")
        .run(`${analysisId}-${index}`, analysisId, citation.brandId, citation.pageUrl, citation.domain, citation.title, index + 1, Number(citation.isOwnDomain));
      return { mentions, citations };
      });
    } catch (error) {
      this.sql.prepare(`INSERT INTO run_analyses VALUES (?,?,?,?,?,'failed',?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET status='failed',error_message=excluded.error_message,analyzed_at=excluded.analyzed_at`)
        .run(analysisId, run.id, ANALYSIS_VERSION, inputHash, "keyword_heuristic", now(), error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private toBrand(row: Record<string, unknown>): ManagedBrand {
    // otherBrands used to be a plain string[] before per-brand aliases were
    // added — coerce old rows so a stale DB never crashes the UI.
    const otherBrands = (JSON.parse(row.other_brands_json as string) as unknown[]).map((entry) =>
      typeof entry === "string" ? { name: entry, aliases: [] } : (entry as { name: string; aliases: string[] })
    );
    return {
      id: row.id as string, organizationId: row.organization_id as string, name: row.name as string,
      url: row.url as string, sitemapUrl: row.sitemap_url as string, description: row.description as string,
      industry: row.industry as string, status: row.status as ManagedBrand["status"],
      markets: JSON.parse(row.markets_json as string), aliases: JSON.parse(row.aliases_json as string),
      otherBrands, urls: JSON.parse(row.urls_json as string),
      socialAccounts: JSON.parse(row.social_accounts_json as string), earnedContentSources: JSON.parse(row.earned_content_sources_json as string),
      cdnConnected: !!row.cdn_connected, gscConnected: !!row.gsc_connected, analyticsConnected: !!row.analytics_connected,
    };
  }

  listBrands(orgId: string): ManagedBrand[] {
    return this.sql.prepare("SELECT * FROM brands WHERE organization_id=? ORDER BY created_at").all(orgId)
      .map(row => this.toBrand(row as Record<string, unknown>));
  }

  getBrand(orgId: string, brandId: string): ManagedBrand | null {
    const row = this.sql.prepare("SELECT * FROM brands WHERE organization_id=? AND id=?").get(orgId, brandId);
    return row ? this.toBrand(row as Record<string, unknown>) : null;
  }

  createBrand(orgId: string, brand: Omit<ManagedBrand, "id" | "organizationId">, brandId?: string): ManagedBrand {
    return this.transaction(() => {
      this.ensureOrg(orgId);
      const newId = brandId ?? id("brand");
      const at = now();
      this.sql.prepare(`INSERT INTO brands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        newId, orgId, brand.name, brand.url, brand.sitemapUrl, brand.description, brand.industry, brand.status,
        JSON.stringify(brand.markets), JSON.stringify(brand.aliases), JSON.stringify(brand.otherBrands),
        JSON.stringify(brand.urls), JSON.stringify(brand.socialAccounts), JSON.stringify(brand.earnedContentSources),
        Number(brand.cdnConnected), Number(brand.gscConnected), Number(brand.analyticsConnected), at, at);
      return this.getBrand(orgId, newId)!;
    });
  }

  updateBrand(orgId: string, brandId: string, patch: Partial<Omit<ManagedBrand, "id" | "organizationId">>): ManagedBrand | null {
    return this.transaction(() => {
      const existing = this.getBrand(orgId, brandId);
      if (!existing) return null;
      const merged = { ...existing, ...patch };
      this.sql.prepare(`UPDATE brands SET name=?,url=?,sitemap_url=?,description=?,industry=?,status=?,
        markets_json=?,aliases_json=?,other_brands_json=?,urls_json=?,social_accounts_json=?,earned_content_sources_json=?,
        cdn_connected=?,gsc_connected=?,analytics_connected=?,updated_at=? WHERE organization_id=? AND id=?`).run(
        merged.name, merged.url, merged.sitemapUrl, merged.description, merged.industry, merged.status,
        JSON.stringify(merged.markets), JSON.stringify(merged.aliases), JSON.stringify(merged.otherBrands),
        JSON.stringify(merged.urls), JSON.stringify(merged.socialAccounts), JSON.stringify(merged.earnedContentSources),
        Number(merged.cdnConnected), Number(merged.gscConnected), Number(merged.analyticsConnected), now(), orgId, brandId);
      return this.getBrand(orgId, brandId);
    });
  }

  deleteBrand(orgId: string, brandId: string): boolean {
    return this.sql.prepare("DELETE FROM brands WHERE organization_id=? AND id=?").run(orgId, brandId).changes > 0;
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
