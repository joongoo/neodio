import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteLibraryRows } from "./deleteLibraryRows";

test("large deletion is sequential and only reports confirmed successes", async () => {
  const ids = Array.from({ length: 650 }, (_, i) => `id-${i}`);
  const removed: string[] = [];
  let active = 0;
  await deleteLibraryRows(ids, (id, count) => {
    removed.push(id);
    assert.equal(count, removed.length);
  }, async () => {
    assert.equal(++active, 1);
    await new Promise(resolve => setTimeout(resolve, 0));
    active--;
    return Response.json({ ok: true });
  });
  assert.deepEqual(removed, ids);
});

test("failure stops subsequent deletions and preserves unconfirmed rows", async () => {
  const removed: string[] = [];
  let requests = 0;
  await assert.rejects(deleteLibraryRows(["a", "b", "c"], id => removed.push(id), async () => {
    requests++;
    return requests === 1 ? Response.json({ ok: true }) : Response.json({ error: "DB unavailable" }, { status: 500 });
  }), /DB unavailable/);
  assert.equal(requests, 2);
  assert.deepEqual(removed, ["a"]);
});
