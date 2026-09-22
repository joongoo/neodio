import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { listPromptLibrary } from "../trackedTopics";

// Each test file gets its own Postgres schema (tsx --test runs this file in
// its own process, so the env vars below don't leak into store.test.ts) —
// same isolation the old ":memory:"/temp-sqlite-file setup gave the API
// tests, now against a real schema instead of a real file.
const baseUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!baseUrl) throw new Error("POSTGRES_URL is required to run API tests — see docs/database.md");
const schema = `test_api_${randomUUID().replaceAll("-", "_")}`;
const scopedUrl = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}`;
process.env.POSTGRES_URL = scopedUrl;
process.env.POSTGRES_URL_NON_POOLING = scopedUrl;

let prompts: typeof import("../../../app/api/prompts/route");
let tracking: typeof import("../../../app/api/tracked-topics/route");
let categories: typeof import("../../../app/api/categories/route");
let bridge: typeof import("../../../app/api/llm-bridge/route");
let getPromptStore: typeof import("./index").getPromptStore;

before(async () => {
  const setup = new Pool({ connectionString: baseUrl });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  await setup.end();
  // Imported after the schema exists and env vars point at it, since these
  // modules resolve the connection/pool at import/first-call time.
  prompts = await import("../../../app/api/prompts/route");
  tracking = await import("../../../app/api/tracked-topics/route");
  categories = await import("../../../app/api/categories/route");
  bridge = await import("../../../app/api/llm-bridge/route");
  ({ getPromptStore } = await import("./index"));
});

after(async () => {
  await (await getPromptStore()).close();
  const cleanup = new Pool({ connectionString: baseUrl });
  await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await cleanup.end();
});
const request = (pathname: string, method = "GET", body?: unknown) => new NextRequest(`http://localhost${pathname}`, {
  method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

test("API lifecycle: strategy -> untracked prompt -> tracking -> rename category -> pause -> archive -> restore", async () => {
  const text = "Integration test question for strategy provenance";
  const category = "Integration category";
  const saved = await bridge.POST(request("/api/llm-bridge", "POST", { scope: "gsc-keyword-prompts", key: "test-keyword",
    data: [{ prompt: text, category, topic: "Integration topic", intent: "comparison", reasoning: "Test evidence" }] }));
  assert.equal(saved.status, 200);
  const listing = await (await prompts.GET(request(`/api/prompts?q=${encodeURIComponent(text)}&status=untracked`))).json();
  assert.equal(listing.total, 1);
  assert.equal(listing.prompts[0].search_intent, "comparison");
  assert.equal(listing.prompts[0].sources[0].generation_reasoning, "Test evidence");
  const track = () => tracking.POST(request("/api/tracked-topics", "POST", { prompt: text, category, source: "gsc", topic: "Integration topic" }));
  const row = (await (await track()).json()).row;
  assert.equal(row.promptId, listing.prompts[0].id);
  assert.equal((await (await track()).json()).row.id, row.id);
  assert.equal((await listPromptLibrary("neodigm")).filter(r => r.id === row.id).length, 1);

  const categoryId = listing.prompts[0].category_id;
  assert.equal((await categories.PATCH(request("/api/categories", "PATCH", { id: categoryId, name: "Renamed integration category" }))).status, 200);
  assert.equal((await listPromptLibrary("neodigm")).find(r => r.id === row.id)!.category, "Renamed integration category");
  assert.equal((await categories.DELETE(request(`/api/categories?id=${categoryId}`, "DELETE"))).status, 409);
  assert.equal((await tracking.PATCH(request(`/api/tracked-topics?id=${row.id}`, "PATCH", { status: "paused" }))).status, 200);
  assert.equal((await listPromptLibrary("neodigm")).some(r => r.id === row.id), false);
  assert.equal((await tracking.DELETE(request(`/api/tracked-topics?id=${row.id}`, "DELETE"))).status, 200);
  const archived = await (await prompts.GET(request(`/api/prompts?q=${encodeURIComponent(text)}&status=archived`))).json();
  assert.equal(archived.total, 1);
  assert.equal((await (await track()).json()).row.addedAt, row.addedAt);
  assert.equal((await listPromptLibrary("neodigm")).find(r => r.id === row.id)!.category, "Renamed integration category");
});

test("API validation and duplicate update leave existing data intact", async () => {
  assert.equal((await prompts.POST(request("/api/prompts", "POST", { text: " " }))).status, 400);
  assert.equal((await prompts.GET(request("/api/prompts?offset=1.5"))).status, 400);
  assert.equal((await prompts.GET(request("/api/prompts?status=invalid"))).status, 400);
  assert.equal((await bridge.POST(request("/api/llm-bridge", "POST", { scope: "gsc-keyword-prompts", key: "x", data: [{ prompt: "missing classification" }] }))).status, 400);
  const create = async (text: string) => (await (await tracking.POST(request("/api/tracked-topics", "POST", { prompt: text, category: "API tests", origin: "manual" }))).json()).row;
  const a = await create("API duplicate test A");
  await create("API duplicate test B");
  const response = await tracking.PATCH(request(`/api/tracked-topics?id=${a.id}`, "PATCH", { prompt: "API duplicate test B", category: "API tests" }));
  assert.equal(response.status, 409);
  assert.equal((await listPromptLibrary("neodigm")).find(r => r.id === a.id)!.prompt, "API duplicate test A");
});

test("brainstorm accepts structured topics and keeps generation evidence", async () => {
  const response = await bridge.POST(request("/api/llm-bridge", "POST", { scope: "llm-brainstorm", key: "test", data: [{
    id: "card-test", tag: "strength", title: "Strength", summary: "Measured rationale", stat: "Measured signal",
    topics: [{ prompt: "Brainstorm API test", category: "API tests", topic: "Brainstorm" }],
  }] }));
  assert.equal(response.status, 200);
  const result = await (await prompts.GET(request("/api/prompts?q=Brainstorm%20API%20test"))).json();
  assert.equal(result.prompts[0].sources[0].generation_purpose, "strength");
  assert.equal(result.prompts[0].sources[0].generation_reasoning, "Measured rationale");
});
