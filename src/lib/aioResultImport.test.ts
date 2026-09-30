import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAioResult } from "./aioResultImport";

const now = Date.parse("2026-09-30T05:00:00.000Z");
const good = {
  status: "aio_present",
  collectedAt: "2026-09-30T04:30:00.000Z",
  aioText: "AI 개요 본문",
  paragraphs: [{ text: "문장", sources: [1, 2] }],
  sources: [{ position: 1, title: "영상", url: "https://www.youtube.com/watch?v=abc", domain: "youtube.com" }],
  screenshotPath: "/Users/someone/.neodio-collector/x.png",
  htmlPath: "/Users/someone/x.html",
};

test("a collected result is re-shaped: unknown fields and the PC-local file paths are dropped", () => {
  const result = sanitizeAioResult({ ...good, evil: "x" }, now);
  assert.ok(result);
  assert.deepEqual(Object.keys(result).sort(), ["aioText", "collectedAt", "paragraphs", "sources", "status"]);
  assert.equal(result.sources[0].url, "https://www.youtube.com/watch?v=abc");
});

test("captcha and error details are kept for failed searches", () => {
  const result = sanitizeAioResult({ status: "failed", errorKind: "captcha", errorMessage: "x".repeat(900), collectedAt: good.collectedAt }, now);
  assert.ok(result);
  assert.equal(result.errorKind, "captcha");
  assert.equal(result.errorMessage?.length, 500);
  assert.deepEqual(result.sources, []);
  assert.equal(result.aioText, null);
});

test("only recent collection times are accepted so an upload cannot overwrite another day", () => {
  assert.equal(sanitizeAioResult({ ...good, collectedAt: "2026-09-27T00:00:00.000Z" }, now), null);
  assert.equal(sanitizeAioResult({ ...good, collectedAt: "2026-10-05T00:00:00.000Z" }, now), null);
  assert.equal(sanitizeAioResult({ ...good, collectedAt: "yesterday" }, now), null);
  assert.ok(sanitizeAioResult({ ...good, collectedAt: "2026-09-29T09:00:00.000Z" }, now), "within 48 hours is fine (a long batch)");
});

test("bad sources and paragraphs are filtered, limits are enforced, unknown status is rejected", () => {
  const result = sanitizeAioResult(
    {
      ...good,
      sources: [
        ...good.sources,
        { position: 0, url: "https://a.com" },
        { position: 2, url: "javascript:alert(1)" },
        { position: 3, url: "https://b.com/" + "x".repeat(3000) },
        ...Array.from({ length: 150 }, (_, i) => ({ position: i + 4, url: `https://s${i}.com`, title: "t", domain: "s.com" })),
      ],
      paragraphs: [{ text: 5 }, { text: "ok", sources: [1, "a", -1, 3.5, 7] }],
    },
    now
  );
  assert.ok(result);
  assert.equal(result.sources.length, 100);
  assert.deepEqual(result.paragraphs, [{ text: "ok", sources: [1, 7] }]);
  assert.equal(sanitizeAioResult({ ...good, status: "hacked" }, now), null);
  assert.equal(sanitizeAioResult(null, now), null);
});
