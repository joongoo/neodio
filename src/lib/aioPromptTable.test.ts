import assert from "node:assert/strict";
import test from "node:test";
import type { AioKeywordRow } from "./db/types";
import { aioPromptFacets, aioPromptTable } from "./aioPromptTable";

function row(id: string, status: AioKeywordRow["status"], owners: boolean[], collectedDate: string | null = "2026-11-19"): AioKeywordRow {
  return { keywordId: id, keyword: `Salesforce ${id}`, group: "brand", status, hasYoutube: owners.length > 0, hasOwn: owners.includes(true), ownPosition: null, sourceCount: owners.length,
    ownVideo: null, youtubeVideos: owners.map((own, index) => ({ videoId: `${id}-${index}`, title: id, channelId: null, channelTitle: null, own, position: index + 1, startSeconds: null })),
    alternative: null, change: { kind: "none", from: null, to: null }, collectedDate };
}
const rows = [row("own", "aio_present", [true]), row("other", "aio_present", [false], "2026-11-18"), row("both", "aio_present", [true, false]), row("empty", "aio_present", []), row("absent", "aio_absent", []), row("waiting", "unmeasured", [], null)];
const ids = (query: string) => aioPromptTable(rows, new URLSearchParams(query)).rows.map(row => row.keywordId);

test("AIO and YouTube filters combine with OR within a field and AND across fields", () => {
  assert.deepEqual(ids("youtube=own"), ["own", "both"]);
  assert.deepEqual(ids("youtube=other"), ["other", "both"]);
  assert.deepEqual(ids("youtube=own,other"), ["own", "other", "both"]);
  assert.deepEqual(ids("youtube=none"), ["empty", "absent"]);
  assert.deepEqual(ids("aio=aio_present&youtube=none"), ["empty"]);
  assert.deepEqual(ids("aio=aio_absent,unmeasured"), ["absent", "waiting"]);
});

test("removed date filters do not hide prompts from old bookmarked URLs", () => {
  assert.deepEqual(ids("from=2026-11-18&to=2026-11-18"), rows.map(row => row.keywordId));
});

test("option counts respect search and the other field without hiding same-field alternatives", () => {
  const facets = aioPromptFacets(rows, new URLSearchParams("aio=aio_present&youtube=own&page=99&size=10"));
  assert.deepEqual(facets.youtube, { own: 2, other: 2, none: 1 });
  assert.deepEqual(facets.aio, { aio_present: 2, aio_absent: 0, unmeasured: 0 });
  const searched = aioPromptFacets(rows, new URLSearchParams("q=absent&youtube=own"));
  assert.deepEqual(searched.youtube, { own: 0, other: 0, none: 1 });
  assert.deepEqual(searched.aio, { aio_present: 0, aio_absent: 0, unmeasured: 0 });
});

test("prompt search trims text, ignores case, and combines with filters", () => {
  assert.deepEqual(ids("q=++SALEsforce+both++&youtube=own"), ["both"]);
  assert.deepEqual(ids("q=other&youtube=own"), []);
  assert.deepEqual(ids("aio=invalid&youtube=invalid"), rows.map(row => row.keywordId));
});

test("pagination slices matching prompts and clamps stale pages after filtering", () => {
  const many = Array.from({ length: 32 }, (_, index) => row(String(index), "aio_present", [true]));
  const page = aioPromptTable(many, new URLSearchParams("page=2&size=25"));
  assert.equal(page.rows.length, 7);
  assert.equal(page.rows[0].keywordId, "25");
  assert.equal(page.filteredTotal, 32);
  assert.equal(page.pageCount, 2);
  const empty = aioPromptTable(many, new URLSearchParams("page=9&q=missing"));
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.filteredTotal, 0);
});
