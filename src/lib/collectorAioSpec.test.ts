import assert from "node:assert/strict";
import test from "node:test";
import { MAX_AIO_DELAY_MS, MAX_AIO_TASKS, MIN_AIO_DELAY_MS, parseAioSpec } from "./collectorAioSpec";

const task = { keywordId: "kw-1", keyword: "마케팅 자동화", device: "mobile" };
const good = { brandId: "brand-a", tasks: [task], country: "KR", language: "ko", minDelayMs: 60000, maxDelayMs: 120000 };

test("a valid plan is normalized (country lower-cased, delays kept)", () => {
  assert.deepEqual(parseAioSpec(good), { brandId: "brand-a", tasks: [task], country: "kr", language: "ko", minDelayMs: 60000, maxDelayMs: 120000 });
});

test("delays are clamped so a caller cannot hammer Google", () => {
  const spec = parseAioSpec({ ...good, minDelayMs: 5000, maxDelayMs: 6000 });
  assert.ok(!("error" in spec));
  assert.equal(spec.minDelayMs, MIN_AIO_DELAY_MS);
  assert.equal(spec.maxDelayMs, MIN_AIO_DELAY_MS);
  const zero = parseAioSpec({ ...good, minDelayMs: 0, maxDelayMs: 0 });
  assert.ok(!("error" in zero));
  assert.ok(zero.minDelayMs > MIN_AIO_DELAY_MS, "0 means unset, so the default interval applies");
  const big = parseAioSpec({ ...good, minDelayMs: 10 ** 9, maxDelayMs: 10 ** 9 });
  assert.ok(!("error" in big));
  assert.equal(big.maxDelayMs, MAX_AIO_DELAY_MS);
  const missing = parseAioSpec({ ...good, minDelayMs: undefined, maxDelayMs: undefined });
  assert.ok(!("error" in missing));
  assert.ok(missing.minDelayMs >= MIN_AIO_DELAY_MS && missing.maxDelayMs >= missing.minDelayMs);
});

test("malformed plans are rejected", () => {
  assert.ok("error" in parseAioSpec(null));
  assert.ok("error" in parseAioSpec({ ...good, brandId: "" }));
  assert.ok("error" in parseAioSpec({ ...good, tasks: [] }));
  assert.ok("error" in parseAioSpec({ ...good, tasks: [{ ...task, device: "tablet" }] }));
  assert.ok("error" in parseAioSpec({ ...good, tasks: [{ ...task, keyword: "" }] }));
  assert.ok("error" in parseAioSpec({ ...good, tasks: [{ ...task, keyword: "x".repeat(201) }] }));
  assert.ok("error" in parseAioSpec({ ...good, tasks: Array.from({ length: MAX_AIO_TASKS + 1 }, () => task) }));
  assert.ok("error" in parseAioSpec({ ...good, country: "korea" }));
  assert.ok("error" in parseAioSpec({ ...good, language: "한국어" }));
});
