import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createTestStore, dropTestStore, type TestStoreHandle } from "./testHelpers";
import { migrateAioKeywordsToPrompts } from "./aioKeywordMigration";
import type { ManagedBrand } from "../../db/types";

const handles: TestStoreHandle[] = [];
async function database() {
  const handle = await createTestStore();
  handles.push(handle);
  return handle.store;
}
afterEach(async () => {
  for (const handle of handles.splice(0)) await dropTestStore(handle);
});

const brandInput: Omit<ManagedBrand, "id" | "organizationId"> = {
  name: "Acme", url: "https://acme.test", sitemapUrl: "", description: "", industry: "", markets: [], status: "active",
  aliases: [], otherBrands: [], urls: [], socialAccounts: [], earnedContentSources: [], cdnConnected: false, gscConnected: false, analyticsConnected: false,
};

async function addKeyword(store: Awaited<ReturnType<typeof database>>, brandId: string, id: string, keyword: string, group: string, status = "active") {
  await store.query(
    "INSERT INTO aio_keywords (id,brand_id,keyword,normalized_keyword,keyword_group,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, brandId, keyword, keyword.toLowerCase(), group, status, `2026-09-0${id.length}T00:00:00.000Z`]
  );
}

test("tracking surfaces are stored per tracking, replaced as a set, and isolated by organization", async () => {
  const store = await database();
  const row = await store.track("org", { text: "질문" }, { brandId: "b", origin: "manual" });
  assert.equal((await store.trackingSurfaces("org")).size, 0, "a tracking with no surfaces has no entry");
  assert.equal(await store.setTrackingSurfaces("org", row.id, ["naver-ai", "google-aio", "naver-ai"]), true);
  assert.deepEqual((await store.trackingSurfaces("org")).get(row.id), ["google-aio", "naver-ai"]);
  assert.equal(await store.setTrackingSurfaces("org", row.id, ["google-ai-mode"]), true);
  assert.deepEqual((await store.trackingSurfaces("org", [row.id])).get(row.id), ["google-ai-mode"]);
  assert.equal(await store.setTrackingSurfaces("other-org", row.id, ["google-aio"]), false, "not visible from another organization");
  assert.equal((await store.trackingSurfaces("other-org")).size, 0);
});

test("AIO keywords become tracked prompts with the AIO surface; existing prompts are reused and keep their classification", async () => {
  const store = await database();
  const org = await store.createOrganization("Acme", "acme");
  const brand = await store.createBrand(org.id, brandInput);
  // 이미 라이브러리에 있는 프롬프트(카테고리·토픽 있음) + 아직 표면이 없는 기존 추적
  const existing = await store.track(org.id, { text: "마케팅 자동화 툴 비교", category: "마케팅 자동화", topic: "툴 비교" }, { brandId: brand.id, origin: "manual" });
  await addKeyword(store, brand.id, "kw-1", "마케팅 자동화 툴 비교", "comparison");
  await addKeyword(store, brand.id, "kw-22", "마케토 도입 비용", "category");
  await addKeyword(store, brand.id, "kw-333", "Acme 후기", "brand");
  await addKeyword(store, brand.id, "kw-4444", "마케토 설치 방법", "howto", "archived");

  const preview = await migrateAioKeywordsToPrompts(store, { dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(preview.keywords, 4);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM aio_keywords WHERE prompt_id IS NOT NULL"))[0].n, 0, "a preview changes nothing");
  assert.equal((await store.library(org.id, brand.id)).length, 1);

  const report = await migrateAioKeywordsToPrompts(store, { dryRun: false });
  assert.equal(report.keywords, 4);
  assert.equal(report.createdPrompts, 3);
  assert.deepEqual(report.reusedPrompts, [{ keyword: "마케팅 자동화 툴 비교", organizationId: org.id }]);
  assert.equal(report.trackingCreated, 3);
  assert.equal(report.trackingArchived, 1);

  const library = await store.library(org.id, brand.id);
  const byPrompt = new Map(library.map((r) => [r.prompt, r]));
  assert.deepEqual([...byPrompt.keys()].sort(), ["Acme 후기", "마케토 도입 비용", "마케팅 자동화 툴 비교"], "the archived keyword's tracking is not in the active library");
  assert.equal(byPrompt.get("마케팅 자동화 툴 비교")!.category, "마케팅 자동화", "an existing prompt keeps its classification");
  assert.equal(byPrompt.get("마케팅 자동화 툴 비교")!.topic, "툴 비교");
  assert.equal(byPrompt.get("마케토 도입 비용")!.topic, "카테고리 키워드", "category/brand groups become a topic");
  assert.equal(byPrompt.get("Acme 후기")!.topic, "브랜드 키워드");

  const surfaces = await store.trackingSurfaces(org.id);
  assert.deepEqual(surfaces.get(byPrompt.get("마케토 도입 비용")!.id), ["google-aio"]);
  assert.deepEqual(surfaces.get(existing.id), ["google-aio"], "the reused prompt gains the AIO surface");

  const comparison = await store.query<{ search_intent: string | null }>("SELECT search_intent FROM prompts WHERE organization_id=$1 AND text=$2", [org.id, "마케토 설치 방법"]);
  assert.equal(comparison[0].search_intent, "정보 탐색", "how-to becomes the 정보 탐색 intent");
  const archived = await store.query<{ status: string }>("SELECT t.status FROM prompt_tracking t JOIN prompts p ON p.id=t.prompt_id WHERE p.text=$1", ["마케토 설치 방법"]);
  assert.equal(archived[0].status, "archived");

  const linked = await store.query<{ id: string; prompt_id: string | null }>("SELECT id,prompt_id FROM aio_keywords ORDER BY id");
  assert.ok(linked.every((k) => k.prompt_id), "every keyword points at its prompt");
  const sources = await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompt_sources WHERE source_type='aio-keyword'");
  assert.equal(sources[0].n, 4, "each keyword leaves a source record so the prompt can be traced back");
});

test("re-running the migration is a no-op, and untouched tracking gets the default AI-answer surfaces", async () => {
  const store = await database();
  const org = await store.createOrganization("Acme", "acme");
  const brand = await store.createBrand(org.id, brandInput);
  const plain = await store.track(org.id, { text: "기존 질문" }, { brandId: brand.id, origin: "manual" });
  await addKeyword(store, brand.id, "kw-1", "마케토 비용", "category");

  const first = await migrateAioKeywordsToPrompts(store, { dryRun: false });
  assert.equal(first.keywords, 1);
  assert.equal(first.defaultSurfacesAdded, 1, "only the pre-existing tracking without surfaces");
  assert.deepEqual((await store.trackingSurfaces(org.id)).get(plain.id), ["google-ai-mode", "naver-ai"]);

  const second = await migrateAioKeywordsToPrompts(store, { dryRun: false });
  assert.equal(second.keywords, 0);
  assert.equal(second.alreadyMigrated, 1);
  assert.equal(second.createdPrompts, 0);
  assert.equal(second.defaultSurfacesAdded, 0);
  assert.equal((await store.library(org.id, brand.id)).length, 2);
});

test("an inactive tracking is reactivated by an active AIO keyword, and the same text in two brands shares one prompt", async () => {
  const store = await database();
  const org = await store.createOrganization("Acme", "acme");
  const brandA = await store.createBrand(org.id, brandInput);
  const brandB = await store.createBrand(org.id, { ...brandInput, name: "Beta", url: "https://beta.test" });
  const paused = await store.track(org.id, { text: "마케토 비용" }, { brandId: brandA.id, origin: "manual" });
  await store.setTrackingStatus(org.id, paused.id, "paused");
  await addKeyword(store, brandA.id, "kw-1", "마케토 비용", "category");
  await addKeyword(store, brandB.id, "kw-22", "마케토 비용", "category");

  const report = await migrateAioKeywordsToPrompts(store, { dryRun: false });
  assert.equal(report.trackingReactivated, 1);
  assert.equal(report.trackingCreated, 1, "brand B gets its own tracking row");
  const prompts = await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompts WHERE organization_id=$1 AND text='마케토 비용'", [org.id]);
  assert.equal(prompts[0].n, 1);
  assert.equal((await store.library(org.id, brandA.id)).length, 1);
  assert.equal((await store.library(org.id, brandB.id)).length, 1);
});
