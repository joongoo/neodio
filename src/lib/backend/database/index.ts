import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { PromptStore } from "./store";
import { promptLibraryByOrg } from "../../db/data/promptLibrary";
import { promptStrategyByOrg } from "../../db/data/promptStrategy";
import { brandsManagementByOrg } from "../../db/data/brandsManagement";
import { seedCategories } from "../../db/data/seed";
import type { ManagedBrand, PromptLibraryRow, PromptRunSeed } from "../../db/types";
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
  if (await store.query("SELECT name FROM data_migrations WHERE name='legacy-prompts-v1'").then(r => r.length)) return;
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
  await store.transaction(async () => {
    if (await store.query("SELECT name FROM data_migrations WHERE name='legacy-prompts-v1'").then(r => r.length)) return;
    for (const category of seedCategories) await store.category(category.organizationId, category.name);
    for (const { orgId, rows } of tracked) {
      for (const row of [...(promptLibraryByOrg[orgId] ?? []), ...rows]) {
        const actorId = await store.legacyActor(orgId, row.lastModifiedBy);
        const saved = await store.track(orgId, { text: row.prompt, category: row.category, topic: row.topic,
          sourceType: row.origin, sourceKey: `legacy:${row.id}`, actorId,
          metadata: { legacyId: row.id, timestampMeaning: "legacy_last_modified" }, createdAt: row.lastModifiedAt ?? undefined },
        { brandId: DEFAULT_TRACKING_BRAND, origin: row.origin, legacyId: row.id, addedAt: row.lastModifiedAt ?? undefined });
        if (deleted.has(`${orgId}::${row.id}`)) await store.setTrackingStatus(orgId, saved.id, "archived");
      }
    }
    for (const [orgId, strategy] of Object.entries(promptStrategyByOrg)) for (const row of strategy.topics) {
      const suggestion = strategy.suggestions.find(s => s.id === row.groupId);
      await store.upsertPrompt(orgId, { text: row.topic, category: row.category, topic: row.topicGroup, searchIntent: row.intent,
        sourceType: row.source, sourceKey: `legacy:${row.id}`, generationPurpose: suggestion?.tag,
        generationReasoning: row.reasoning ?? suggestion?.summary, metadata: { legacyStrategyId: row.id, market: row.market } });
    }
    for (const bridge of bridges.filter(b => b.scope !== "prompt-topic-groups")) await store.putBridge(bridge.orgId, bridge.scope, bridge.entries);
    for (const bridge of bridges.filter(b => b.scope === "prompt-topic-groups")) await store.putBridge(bridge.orgId, bridge.scope, bridge.entries);
    await store.query("INSERT INTO data_migrations VALUES ('legacy-prompts-v1',$1)", [new Date().toISOString()]);
  });
}

// 브랜드 관리(추가/편집/삭제)를 .tmp/brands-management-{added,patches,deleted}.json
// 3개 파일로 시드 위에 얹어 계산하던 방식을 그만두고, 다른 테이블처럼 실
// 행으로 옮긴다 — 시드 브랜드도 이 마이그레이션 이후엔 진짜로 지우거나
// 고칠 수 있는 보통 행이 된다.
async function importLegacyBrands(store: PromptStore) {
  if (await store.query("SELECT name FROM data_migrations WHERE name='legacy-brands-v1'").then(r => r.length)) return;
  const added = await jsonFile<ManagedBrand[]>(".tmp/brands-management-added.json", []);
  const patches = await jsonFile<Record<string, Partial<ManagedBrand>>>(".tmp/brands-management-patches.json", {});
  const deleted = new Set(await jsonFile<string[]>(".tmp/brands-management-deleted.json", []));
  await store.transaction(async () => {
    if (await store.query("SELECT name FROM data_migrations WHERE name='legacy-brands-v1'").then(r => r.length)) return;
    for (const [orgId, data] of Object.entries(brandsManagementByOrg)) {
      for (const brand of [...data.brands, ...added.filter(b => b.organizationId === orgId)]) {
        if (deleted.has(brand.id)) continue;
        const { id: brandId, organizationId, ...rest } = { ...brand, ...(patches[brand.id] ?? {}) };
        await store.createBrand(organizationId, rest, brandId);
      }
    }
    await store.query("INSERT INTO data_migrations VALUES ('legacy-brands-v1',$1)", [new Date().toISOString()]);
  });
}

// Vercel Postgres(및 다른 표준 Postgres)는 POSTGRES_URL/POSTGRES_URL_NON_POOLING
// 환경변수로 접속 정보를 주입한다 — SQLite 시절의 파일 경로/디렉토리 생성 로직은
// 더 이상 필요 없다(과거엔 여기서 mkdir을 하다 Vercel의 읽기전용 배포 번들에서
// 매 요청마다 ENOENT로 죽었고, /tmp로 돌려도 콜드스타트마다 초기화돼 실제
// 영속성이 없었다 — 이 클래스의 git 히스토리 참고). 로컬 개발/테스트도 같은
// 환경변수로 실제(로컬) Postgres를 가리키면 된다.
function createPool(): Pool {
  // Prefer the pooled (pgbouncer) endpoint — every request here is a short
  // borrow-query-return, exactly what Neon's pooler is for. The non-pooling
  // URL opens a direct connection per serverless invocation, which is both
  // slower (extra handshake, risks waking a suspended compute) and burns
  // through Neon's direct-connection limit under concurrent traffic.
  const connectionString = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) throw new Error("POSTGRES_URL (or POSTGRES_URL_NON_POOLING) is required — see docs/database.md");
  return new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
}

export function getPromptStore(): Promise<PromptStore> {
  if (!initializing) initializing = (async () => {
    const store = new PromptStore(createPool());
    try { await store.init(); await importLegacy(store); await importLegacyBrands(store); await syncCollectedFiles(store); return store; }
    catch (error) { await store.close(); throw error; }
  })().catch(error => { initializing = undefined; throw error; });
  return initializing;
}

// Collector JSON remains the ingestion boundary; unchanged files are not parsed again.
export async function syncCollectedFiles(store: PromptStore) {
  for (const dir of RUN_DIRS) for (const filename of await filenames(dir)) {
    const filePath = path.join(/* turbopackIgnore: true */ dir, filename);
    const info = await stat(/* turbopackIgnore: true */ filePath);
    const signature = `${info.mtimeMs}:${info.size}`;
    const [previous] = await store.query<{ signature: string }>("SELECT signature FROM imported_files WHERE path=$1", [filePath]);
    if (previous?.signature === signature) continue;
    const parsed = await jsonFile<{ promptRun?: PromptRunSeed }>(filePath, {});
    if (!parsed.promptRun) continue;
    const run = parsed.promptRun;
    const sourceJobId = run.rawMetadata.collectionJobId;
    const [job] = sourceJobId ? await store.query("SELECT id FROM collection_jobs WHERE id=$1 AND organization_id=$2", [sourceJobId, ORG_ID]) : [];
    const jobId = job ? sourceJobId! : null;
    await store.transaction(async () => {
      await store.importRun(ORG_ID, { dir, filename, promptRun: run }, jobId);
      await store.query("INSERT INTO imported_files VALUES ($1,$2) ON CONFLICT(path) DO UPDATE SET signature=excluded.signature", [filePath, signature]);
    });
  }
}

export async function persistCollectionJob(job: CollectionJob) {
  const store = await getPromptStore();
  await store.ensureOrg(ORG_ID);
  await store.query(`INSERT INTO collection_jobs VALUES ($1,$2,'manual',NULL,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,finished_at=excluded.finished_at,data_json=excluded.data_json`,
    [job.id, ORG_ID, job.stage, new Date(job.startedAt).toISOString(), job.finishedAt ? new Date(job.finishedAt).toISOString() : null, JSON.stringify({ ...job, ownerPid: process.pid })]);
}

export async function getPersistedCollectionJob(jobId: string): Promise<CollectionJob | undefined> {
  const store = await getPromptStore();
  const [row] = await store.query<{ data_json: CollectionJob & { ownerPid?: number } }>(
    "SELECT data_json FROM collection_jobs WHERE id=$1 AND organization_id=$2", [jobId, ORG_ID]);
  if (!row) return undefined;
  const job = row.data_json;
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
