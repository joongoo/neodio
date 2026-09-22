import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createTestStore, dropTestStore, type TestStoreHandle } from "./testHelpers";
import type { BrandSeed, PromptRunSeed } from "../../db/types";

const handles: TestStoreHandle[] = [];
async function database() { const handle = await createTestStore(); handles.push(handle); return handle.store; }
afterEach(async () => { for (const handle of handles.splice(0)) await dropTestStore(handle); });
const options = { brandId: "brand-a", origin: "manual" as const };
const brands: BrandSeed[] = [
  { id: "brand-a", organizationId: "org", name: "Acme", domain: "acme.test", isOwnBrand: true, status: "active", category: "", aliases: [] },
  { id: "brand-b", organizationId: "org", name: "Other", domain: "other.test", isOwnBrand: false, status: "active", category: "", aliases: [] },
];
function run(overrides: Partial<PromptRunSeed> = {}): PromptRunSeed {
  return { id: "run-1", promptId: "old-id", llmModelId: "model", marketId: "market-kr", runAt: "2026-09-17T00:00:00Z",
    status: "success", rawResponse: "Acme is recommended. https://acme.test/page", rawMetadata: { source: "api", query: "Which company?" }, ...overrides };
}

test("one prompt per normalized text and organization, multiple provenance records", async () => {
  const store = await database();
  const first = await store.upsertPrompt("org", { text: "  Which   Company? ", sourceType: "gsc", generationReasoning: "coverage gap" });
  assert.equal(await store.upsertPrompt("org", { text: "which company?", sourceType: "manual" }), first);
  assert.notEqual(await store.upsertPrompt("other-org", { text: "which company?" }), first);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompt_sources WHERE prompt_id=$1", [first]))[0].n, 2);
});

test("tracking is idempotent and archival preserves the prompt and first added date", async () => {
  const store = await database();
  const row = await store.track("org", { text: "Question", topic: "Topic", category: "Category" }, { ...options, addedAt: "2026-09-01" });
  assert.equal((await store.track("org", { text: " Question " }, options)).id, row.id);
  assert.equal((await store.library("org")).length, 1);
  assert.equal(Object.getPrototypeOf((await store.library("org"))[0]), Object.prototype);
  await store.setTrackingStatus("org", row.id, "archived");
  assert.equal((await store.library("org")).length, 0);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompts"))[0].n, 1);
  const restored = await store.track("org", { text: "Question" }, options);
  assert.equal(restored.addedAt, "2026-09-01");
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM tracking_events"))[0].n, 3);
});

test("brand tracking and organization writes are isolated", async () => {
  const store = await database();
  const row = await store.track("org", { text: "Question" }, options);
  await store.track("org", { text: "Question" }, { ...options, brandId: "brand-b" });
  assert.equal((await store.library("org", "brand-a")).length, 1);
  assert.equal(await store.setTrackingStatus("other", row.id, "archived"), false);
  await store.setTrackingStatus("org", row.id, "paused");
  assert.equal((await store.library("org", "brand-a")).length, 0);
  assert.equal((await store.library("org", "brand-b")).length, 1);
});

test("category changes propagate through topic references; same topic labels can exist in different categories", async () => {
  const store = await database();
  const a = await store.upsertPrompt("org", { text: "A", category: "One", topic: "Shared" });
  const b = await store.upsertPrompt("org", { text: "B", category: "Two", topic: "Shared" });
  assert.notEqual((await store.getPrompt("org", a))!.topic_id, (await store.getPrompt("org", b))!.topic_id);
  await store.query("UPDATE categories SET name='Renamed' WHERE name='One'");
  assert.equal((await store.getPrompt("org", a))!.category, "Renamed");
});

test("foreign keys reject category assignments across organizations", async () => {
  const store = await database();
  const category = await store.category("other", "Private");
  const prompt = await store.upsertPrompt("org", { text: "A" });
  await assert.rejects(store.query("UPDATE prompts SET uncategorized_category_id=$1 WHERE id=$2", [category, prompt]), /foreign key/i);
});

test("strategy intent and generation rationale persist before and after tracking", async () => {
  const store = await database();
  await store.putBridge("org", "gsc-keyword-prompts", { keyword: [{ prompt: "Question", category: "Category", topic: "Topic", intent: "comparison", reasoning: "High impressions" }] });
  assert.equal((await store.library("org")).length, 0);
  const row = await store.track("org", { text: "Question" }, options);
  assert.equal(row.searchIntent, "comparison");
  assert.equal(row.category, "Category");
  const [source] = await store.query<{ generation_reasoning: string; generation_purpose: string }>("SELECT generation_reasoning,generation_purpose FROM prompt_sources");
  assert.equal(source.generation_reasoning, "High impressions");
  assert.equal(source.generation_purpose, "coverage_gap");
});

test("invalid bulk grouping rolls back bridge writes and classifications", async () => {
  const store = await database();
  await store.upsertPrompt("org", { text: "Question", category: "Category", topic: "Original" });
  await assert.rejects(store.putBridge("org", "prompt-topic-groups", { current: [
    { topic: "One", prompts: ["Question"] }, { topic: "Two", prompts: [" question "] },
  ] }), /multiple topic groups/);
  assert.equal((await store.groups("org"))[0].topic, "Original");
  assert.deepEqual(await store.bridgeScope("org", "prompt-topic-groups"), {});
});

test("editing a prompt keeps the exact collected question and canonical prompt ID", async () => {
  const store = await database();
  await store.importRun("org", { dir: "collector", filename: "1.json", promptRun: run() });
  const row = await store.track("org", { text: "Which company?" }, options);
  await store.updateLibrary("org", row.id, { prompt: "Revised question?", category: "Category", topic: "Topic" });
  const storedRun = (await store.runs("org"))[0].promptRun;
  assert.equal(storedRun.promptId, row.promptId);
  assert.equal(storedRun.rawMetadata.query, "Which company?");
  assert.equal((await store.getPrompt("org", row.promptId!))!.text, "Revised question?");
  assert.equal(storedRun.rawMetadata.topic, "Topic");
  await store.importRun("org", { dir: "collector", filename: "1.json", promptRun: run() });
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompts"))[0].n, 1);
});

test("duplicate edits are rejected atomically", async () => {
  const store = await database();
  const row = await store.track("org", { text: "A", category: "Original" }, options);
  await store.upsertPrompt("org", { text: "B" });
  await assert.rejects(store.updateLibrary("org", row.id, { prompt: "B", category: "New", topic: "Topic" }), /already exists/);
  assert.equal((await store.library("org"))[0].prompt, "A");
  assert.equal((await store.library("org"))[0].category, "Original");
});

test("analysis caches per run and brand configuration, unmentioned sentiment remains null", async () => {
  const store = await database();
  const input = run();
  await store.importRun("org", { dir: "collector", filename: "1.json", promptRun: input });
  const first = await store.analyze(input, brands);
  assert.deepEqual(await store.analyze(input, brands), first);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM run_analyses"))[0].n, 1);
  const [absent] = await store.query<{ sentiment: string | null; sentiment_score: number | null }>("SELECT sentiment,sentiment_score FROM brand_observations WHERE brand_id='brand-b'");
  assert.equal(absent.sentiment, null);
  assert.equal(absent.sentiment_score, null);
  assert.equal((await store.query<{ sentiment_score: number }>("SELECT sentiment_score FROM brand_observations WHERE brand_id='brand-a'"))[0].sentiment_score, 0.56);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM citations"))[0].n, 1);
  await store.analyze(input, brands.map(brand => ({ ...brand, aliases: ["new alias"] })));
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM run_analyses"))[0].n, 2);
});

test("repeated collection is distinct from retry and import is idempotent", async () => {
  const store = await database();
  const input = { dir: "collector", filename: "1.json", promptRun: run() };
  await store.importRun("org", input);
  await store.importRun("org", input);
  await store.importRun("org", { ...input, filename: "2.json", promptRun: run({ id: "run-2" }) });
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompts"))[0].n, 1);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompt_runs"))[0].n, 2);
  assert.equal((await store.query<{ n: number }>("SELECT count(*)::int AS n FROM prompt_runs WHERE retry_of_run_id IS NOT NULL"))[0].n, 0);
});

test("cross-organization run conflicts and failed collection analysis are rejected", async () => {
  const store = await database();
  const input = { dir: "collector", filename: "1.json", promptRun: run() };
  await store.importRun("org", input);
  await assert.rejects(store.importRun("other-org", input), /another organization/);
  await assert.rejects(store.analyze(run({ status: "failed" }), brands), /successful runs/);
});

test("legacy brainstorm strings are adapted without changing their prompt text", async () => {
  const store = await database();
  await store.putBridge("org", "llm-brainstorm", { current: [{ tag: "strength", title: "Legacy", topics: ["Old question"] }] });
  const scope = await store.bridgeScope<{ id: string; topics: { prompt: string }[] }[]>("org", "llm-brainstorm");
  const cards = scope.current;
  assert.equal(cards[0].topics[0].prompt, "Old question");
  assert.ok(cards[0].id);
});
