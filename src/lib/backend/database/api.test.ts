import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import * as prompts from "../../../app/api/prompts/route";
import * as tracking from "../../../app/api/tracked-topics/route";
import * as categories from "../../../app/api/categories/route";
import * as bridge from "../../../app/api/llm-bridge/route";
import { getPromptStore } from "./index";
import { listPromptLibrary } from "../trackedTopics";

const directory = mkdtempSync(path.join(os.tmpdir(), "neodio-db-api-"));
process.env.NEODIO_DB_PATH = path.join(directory, "test.sqlite");
after(async () => { (await getPromptStore()).sql.close(); rmSync(directory, { recursive: true, force: true }); });
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
