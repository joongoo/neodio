import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { PromptStore } from "./store";
import type { BrandSeed, PromptRunSeed } from "../../db/types";

const stores: PromptStore[] = [];
function database() { const store = new PromptStore(":memory:"); stores.push(store); return store; }
afterEach(() => { for (const store of stores.splice(0)) store.sql.close(); });
const options = { brandId: "brand-a", origin: "manual" as const };
const brands: BrandSeed[] = [
  { id: "brand-a", organizationId: "org", name: "Acme", domain: "acme.test", isOwnBrand: true, status: "active", category: "", aliases: [] },
  { id: "brand-b", organizationId: "org", name: "Other", domain: "other.test", isOwnBrand: false, status: "active", category: "", aliases: [] },
];
function run(overrides: Partial<PromptRunSeed> = {}): PromptRunSeed {
  return { id: "run-1", promptId: "old-id", llmModelId: "model", marketId: "market-kr", runAt: "2026-09-17T00:00:00Z",
    status: "success", rawResponse: "Acme is recommended. https://acme.test/page", rawMetadata: { source: "api", query: "Which company?" }, ...overrides };
}

test("one prompt per normalized text and organization, multiple provenance records", () => {
  const store = database();
  const first = store.upsertPrompt("org", { text: "  Which   Company? ", sourceType: "gsc", generationReasoning: "coverage gap" });
  assert.equal(store.upsertPrompt("org", { text: "which company?", sourceType: "manual" }), first);
  assert.notEqual(store.upsertPrompt("other-org", { text: "which company?" }), first);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompt_sources WHERE prompt_id=?").get(first)!.n, 2);
});

test("tracking is idempotent and archival preserves the prompt and first added date", () => {
  const store = database();
  const row = store.track("org", { text: "Question", topic: "Topic", category: "Category" }, { ...options, addedAt: "2026-09-01" });
  assert.equal(store.track("org", { text: " Question " }, options).id, row.id);
  assert.equal(store.library("org").length, 1);
  assert.equal(Object.getPrototypeOf(store.library("org")[0]), Object.prototype);
  store.setTrackingStatus("org", row.id, "archived");
  assert.equal(store.library("org").length, 0);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompts").get()!.n, 1);
  const restored = store.track("org", { text: "Question" }, options);
  assert.equal(restored.addedAt, "2026-09-01");
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM tracking_events").get()!.n, 3);
});

test("brand tracking and organization writes are isolated", () => {
  const store = database();
  const row = store.track("org", { text: "Question" }, options);
  store.track("org", { text: "Question" }, { ...options, brandId: "brand-b" });
  assert.equal(store.library("org", "brand-a").length, 1);
  assert.equal(store.setTrackingStatus("other", row.id, "archived"), false);
  store.setTrackingStatus("org", row.id, "paused");
  assert.equal(store.library("org", "brand-a").length, 0);
  assert.equal(store.library("org", "brand-b").length, 1);
});

test("category changes propagate through topic references; same topic labels can exist in different categories", () => {
  const store = database();
  const a = store.upsertPrompt("org", { text: "A", category: "One", topic: "Shared" });
  const b = store.upsertPrompt("org", { text: "B", category: "Two", topic: "Shared" });
  assert.notEqual(store.getPrompt("org", a)!.topic_id, store.getPrompt("org", b)!.topic_id);
  store.sql.prepare("UPDATE categories SET name='Renamed' WHERE name='One'").run();
  assert.equal(store.getPrompt("org", a)!.category, "Renamed");
});

test("foreign keys reject category assignments across organizations", () => {
  const store = database();
  const category = store.category("other", "Private");
  const prompt = store.upsertPrompt("org", { text: "A" });
  assert.throws(() => store.sql.prepare("UPDATE prompts SET uncategorized_category_id=? WHERE id=?").run(category, prompt), /FOREIGN KEY/);
});

test("strategy intent and generation rationale persist before and after tracking", () => {
  const store = database();
  store.putBridge("org", "gsc-keyword-prompts", { keyword: [{ prompt: "Question", category: "Category", topic: "Topic", intent: "comparison", reasoning: "High impressions" }] });
  assert.equal(store.library("org").length, 0);
  const row = store.track("org", { text: "Question" }, options);
  assert.equal(row.searchIntent, "comparison");
  assert.equal(row.category, "Category");
  const source = store.sql.prepare("SELECT generation_reasoning,generation_purpose FROM prompt_sources").get()!;
  assert.equal(source.generation_reasoning, "High impressions");
  assert.equal(source.generation_purpose, "coverage_gap");
});

test("invalid bulk grouping rolls back bridge writes and classifications", () => {
  const store = database();
  store.upsertPrompt("org", { text: "Question", category: "Category", topic: "Original" });
  assert.throws(() => store.putBridge("org", "prompt-topic-groups", { current: [
    { topic: "One", prompts: ["Question"] }, { topic: "Two", prompts: [" question "] },
  ] }), /multiple topic groups/);
  assert.equal(store.groups("org")[0].topic, "Original");
  assert.deepEqual(store.bridgeScope("org", "prompt-topic-groups"), {});
});

test("editing a prompt keeps the exact collected question and canonical prompt ID", () => {
  const store = database();
  store.importRun("org", { dir: "collector", filename: "1.json", promptRun: run() });
  const row = store.track("org", { text: "Which company?" }, options);
  store.updateLibrary("org", row.id, { prompt: "Revised question?", category: "Category", topic: "Topic" });
  const storedRun = store.runs("org")[0].promptRun;
  assert.equal(storedRun.promptId, row.promptId);
  assert.equal(storedRun.rawMetadata.query, "Which company?");
  assert.equal(store.getPrompt("org", row.promptId!)!.text, "Revised question?");
  assert.equal(storedRun.rawMetadata.topic, "Topic");
  store.importRun("org", { dir: "collector", filename: "1.json", promptRun: run() });
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompts").get()!.n, 1);
});

test("duplicate edits are rejected atomically", () => {
  const store = database();
  const row = store.track("org", { text: "A", category: "Original" }, options);
  store.upsertPrompt("org", { text: "B" });
  assert.throws(() => store.updateLibrary("org", row.id, { prompt: "B", category: "New", topic: "Topic" }), /already exists/);
  assert.equal(store.library("org")[0].prompt, "A");
  assert.equal(store.library("org")[0].category, "Original");
});

test("analysis caches per run and brand configuration, unmentioned sentiment remains null", () => {
  const store = database();
  const input = run();
  store.importRun("org", { dir: "collector", filename: "1.json", promptRun: input });
  const first = store.analyze(input, brands);
  assert.deepEqual(store.analyze(input, brands), first);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM run_analyses").get()!.n, 1);
  const absent = store.sql.prepare("SELECT sentiment,sentiment_score FROM brand_observations WHERE brand_id='brand-b'").get()!;
  assert.equal(absent.sentiment, null);
  assert.equal(absent.sentiment_score, null);
  assert.equal(store.sql.prepare("SELECT sentiment_score FROM brand_observations WHERE brand_id='brand-a'").get()!.sentiment_score, 0.56);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM citations").get()!.n, 1);
  store.analyze(input, brands.map(brand => ({ ...brand, aliases: ["new alias"] })));
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM run_analyses").get()!.n, 2);
});

test("repeated collection is distinct from retry and import is idempotent", () => {
  const store = database();
  const input = { dir: "collector", filename: "1.json", promptRun: run() };
  store.importRun("org", input);
  store.importRun("org", input);
  store.importRun("org", { ...input, filename: "2.json", promptRun: run({ id: "run-2" }) });
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompts").get()!.n, 1);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompt_runs").get()!.n, 2);
  assert.equal(store.sql.prepare("SELECT count(*) AS n FROM prompt_runs WHERE retry_of_run_id IS NOT NULL").get()!.n, 0);
  assert.deepEqual(store.sql.prepare("PRAGMA foreign_key_check").all(), []);
});

test("cross-organization run conflicts and failed collection analysis are rejected", () => {
  const store = database();
  const input = { dir: "collector", filename: "1.json", promptRun: run() };
  store.importRun("org", input);
  assert.throws(() => store.importRun("other-org", input), /another organization/);
  assert.throws(() => store.analyze(run({ status: "failed" }), brands), /successful runs/);
});

test("legacy brainstorm strings are adapted without changing their prompt text", () => {
  const store = database();
  store.putBridge("org", "llm-brainstorm", { current: [{ tag: "strength", title: "Legacy", topics: ["Old question"] }] });
  const cards = store.bridgeScope<{ id: string; topics: { prompt: string }[] }[]>("org", "llm-brainstorm").current;
  assert.equal(cards[0].topics[0].prompt, "Old question");
  assert.ok(cards[0].id);
});
