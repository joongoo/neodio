import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PromptStore } from "./store";
import { promptLibraryByOrg } from "../../db/data/promptLibrary";
import { promptStrategyByOrg } from "../../db/data/promptStrategy";
import { seedCategories } from "../../db/data/seed";
import type { PromptLibraryRow, PromptRunSeed } from "../../db/types";
import type { CollectionJob } from "../collectionJobTypes";

const ORG_ID = "neodigm";
export const DEFAULT_TRACKING_BRAND = "brand-neodigm";
const RUN_DIRS = [".tmp/naver-ai", ".tmp/google-ai"];
let initializing: Promise<PromptStore> | undefined;

async function jsonFile<T>(filename: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(filename, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Cannot import ${filename}`, { cause: error });
  }
}

async function filenames(dir: string): Promise<string[]> {
  try { return (await readdir(dir)).filter(name => name.endsWith(".json")).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function importLegacy(store: PromptStore) {
  if (store.sql.prepare("SELECT name FROM data_migrations WHERE name='legacy-prompts-v1'").get()) return;
  const deleted = new Set(await jsonFile<string[]>(".tmp/deleted-library-rows.json", []));
  const tracked: { orgId: string; rows: PromptLibraryRow[] }[] = [];
  const bridges: { orgId: string; scope: string; entries: Record<string, unknown> }[] = [];
  for (const orgId of Object.keys(promptLibraryByOrg)) {
    const dir = path.join(".tmp/tracked-topics", orgId);
    const rows = await Promise.all((await filenames(dir)).map(file => jsonFile<PromptLibraryRow>(path.join(dir, file), null as never)));
    tracked.push({ orgId, rows });
    const bridgeDir = path.join(".tmp/llm-bridge", orgId);
    for (const file of await filenames(bridgeDir)) bridges.push({ orgId, scope: file.slice(0, -5), entries: await jsonFile(path.join(bridgeDir, file), {}) });
  }
  store.transaction(() => {
    if (store.sql.prepare("SELECT name FROM data_migrations WHERE name='legacy-prompts-v1'").get()) return;
    for (const category of seedCategories) store.category(category.organizationId, category.name);
    for (const { orgId, rows } of tracked) {
      for (const row of [...(promptLibraryByOrg[orgId] ?? []), ...rows]) {
        const actorId = store.legacyActor(orgId, row.lastModifiedBy);
        const saved = store.track(orgId, { text: row.prompt, category: row.category, topic: row.topic,
          sourceType: row.origin, sourceKey: `legacy:${row.id}`, actorId,
          metadata: { legacyId: row.id, timestampMeaning: "legacy_last_modified" }, createdAt: row.lastModifiedAt ?? undefined },
        { brandId: DEFAULT_TRACKING_BRAND, origin: row.origin, legacyId: row.id, addedAt: row.lastModifiedAt ?? undefined });
        if (deleted.has(`${orgId}::${row.id}`)) store.setTrackingStatus(orgId, saved.id, "archived");
      }
    }
    for (const [orgId, strategy] of Object.entries(promptStrategyByOrg)) for (const row of strategy.topics) {
      const suggestion = strategy.suggestions.find(s => s.id === row.groupId);
      store.upsertPrompt(orgId, { text: row.topic, category: row.category, topic: row.topicGroup, searchIntent: row.intent,
        sourceType: row.source, sourceKey: `legacy:${row.id}`, generationPurpose: suggestion?.tag,
        generationReasoning: row.reasoning ?? suggestion?.summary, metadata: { legacyStrategyId: row.id, market: row.market } });
    }
    for (const bridge of bridges.filter(b => b.scope !== "prompt-topic-groups")) store.putBridge(bridge.orgId, bridge.scope, bridge.entries);
    for (const bridge of bridges.filter(b => b.scope === "prompt-topic-groups")) store.putBridge(bridge.orgId, bridge.scope, bridge.entries);
    store.sql.prepare("INSERT INTO data_migrations VALUES ('legacy-prompts-v1',?)").run(new Date().toISOString());
  });
}

export function getPromptStore(): Promise<PromptStore> {
  if (!initializing) initializing = (async () => {
    const store = new PromptStore(process.env.NEODIO_DB_PATH ?? path.join(process.cwd(), ".data/neodio.sqlite"));
    try { await importLegacy(store); await syncCollectedFiles(store); return store; }
    catch (error) { store.sql.close(); throw error; }
  })().catch(error => { initializing = undefined; throw error; });
  return initializing;
}

// Collector JSON remains the ingestion boundary; unchanged files are not parsed again.
export async function syncCollectedFiles(store: PromptStore) {
  for (const dir of RUN_DIRS) for (const filename of await filenames(dir)) {
    const filePath = path.join(/* turbopackIgnore: true */ dir, filename);
    const info = await stat(/* turbopackIgnore: true */ filePath);
    const signature = `${info.mtimeMs}:${info.size}`;
    const previous = store.sql.prepare("SELECT signature FROM imported_files WHERE path=?").get(filePath);
    if (previous?.signature === signature) continue;
    const parsed = await jsonFile<{ promptRun?: PromptRunSeed }>(filePath, {});
    if (!parsed.promptRun) continue;
    const run = parsed.promptRun;
    const sourceJobId = run.rawMetadata.collectionJobId;
    const jobId = sourceJobId && store.sql.prepare("SELECT id FROM collection_jobs WHERE id=? AND organization_id=?").get(sourceJobId, ORG_ID)
      ? sourceJobId : null;
    store.transaction(() => {
      store.importRun(ORG_ID, { dir, filename, promptRun: run }, jobId);
      store.sql.prepare("INSERT INTO imported_files VALUES (?,?) ON CONFLICT(path) DO UPDATE SET signature=excluded.signature").run(filePath, signature);
    });
  }
}

export async function persistCollectionJob(job: CollectionJob) {
  const store = await getPromptStore();
  store.ensureOrg(ORG_ID);
  store.sql.prepare(`INSERT INTO collection_jobs VALUES (?,?,'manual',NULL,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at,data_json=excluded.data_json`)
    .run(job.id, ORG_ID, job.stage, new Date(job.startedAt).toISOString(), job.finishedAt ? new Date(job.finishedAt).toISOString() : null, JSON.stringify({ ...job, ownerPid: process.pid }));
}

export async function getPersistedCollectionJob(jobId: string): Promise<CollectionJob | undefined> {
  const store = await getPromptStore();
  const row = store.sql.prepare("SELECT data_json FROM collection_jobs WHERE id=? AND organization_id=?").get(jobId, ORG_ID);
  if (!row) return undefined;
  const job = JSON.parse(row.data_json as string) as CollectionJob & { ownerPid?: number };
  if (job.stage !== "done" && job.stage !== "error") {
    if (job.ownerPid) {
      try { process.kill(job.ownerPid, 0); return job; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    job.stage = "error";
    job.error = "Collection worker stopped before completion.";
    job.finishedAt = Date.now();
    await persistCollectionJob(job);
  }
  return job;
}
