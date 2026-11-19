import assert from "node:assert/strict";
import { test } from "node:test";
import { updateLibrarySurfaces } from "./updateLibrarySurfaces";

test("650 selections are updated in 26 sequential batches without a total limit", async () => {
  const ids = Array.from({ length: 650 }, (_, i) => `row-${i}`);
  const saved: string[] = [];
  let active = 0;
  let requests = 0;
  await updateLibrarySurfaces([...ids, ids[0]], ["naver-ai"], batch => saved.push(...batch), async (_url, init) => {
    assert.equal(++active, 1);
    requests++;
    const body = JSON.parse(init!.body as string);
    assert.ok(body.ids.length <= 25);
    assert.deepEqual(body.surfaces, ["naver-ai"]);
    await Promise.resolve();
    active--;
    return Response.json({ changed: body.ids.length, ids: body.ids });
  });
  assert.equal(requests, 26);
  assert.deepEqual(saved, ids);
});

test("partial failure preserves confirmed changes and stops later batches", async () => {
  const saved: string[] = [];
  let requests = 0;
  await assert.rejects(updateLibrarySurfaces(Array.from({ length: 75 }, (_, i) => `row-${i}`), ["gemini"], batch => saved.push(...batch), async () => {
    requests++;
    return Response.json({ ids: ["row-0"], error: "interrupted" }, { status: 500 });
  }), /interrupted/);
  assert.equal(requests, 1);
  assert.deepEqual(saved, ["row-0"]);
});

test("missing rows are not reported as saved", async () => {
  const saved: string[] = [];
  await assert.rejects(updateLibrarySurfaces(["found", "missing"], ["gemini"], batch => saved.push(...batch), async () =>
    Response.json({ changed: 1, ids: ["found"] })));
  assert.deepEqual(saved, ["found"]);
});
