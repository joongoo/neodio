import assert from "node:assert/strict";
import { test } from "node:test";
import { importPromptCsv } from "./importPromptCsv";

test("650 prompts use 26 sequential batches with at most 25 rows", async () => {
  const rows = Array.from({ length: 650 }, (_, i) => ({ prompt: `Q${i}`, category: "C", topic: "T" }));
  let active = 0;
  let requests = 0;
  const saved: string[] = [];
  await importPromptCsv(rows, batch => saved.push(...batch.map(row => row.prompt)), async (_url, init) => {
    assert.equal(++active, 1);
    requests++;
    const batch = JSON.parse(init!.body as string).rows;
    assert.ok(batch.length <= 25);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return Response.json({ ok: true, rows: batch });
  });
  assert.equal(requests, 26);
  assert.deepEqual(saved, rows.map(row => row.prompt));
});

test("partial failure retains saved rows and stops later batches", async () => {
  let requests = 0;
  const saved: string[] = [];
  await assert.rejects(importPromptCsv(
    Array.from({ length: 75 }, () => ({ prompt: "Q", category: "", topic: "" })),
    batch => saved.push(...batch.map(row => row.prompt)),
    async () => {
      requests++;
      return Response.json({ ok: false, rows: [{ prompt: "saved" }], error: "stopped" }, { status: 500 });
    },
  ), /stopped/);
  assert.equal(requests, 1);
  assert.deepEqual(saved, ["saved"]);
});
