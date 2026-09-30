import assert from "node:assert/strict";
import test from "node:test";
import { AIO_GROUP_TO_PROMPT, aioGroupFor, normalizeKeyword } from "./aioKeywordMapping";

test("keyword normalization collapses spacing and case", () => {
  assert.equal(normalizeKeyword("  Marketo   가격  "), "marketo 가격");
});

test("every group round-trips through the prompt classification", () => {
  for (const [group, mapping] of Object.entries(AIO_GROUP_TO_PROMPT)) {
    assert.equal(aioGroupFor(mapping.searchIntent, mapping.topic), group);
  }
});

test("prompts without an AIO-style classification become category keywords", () => {
  assert.equal(aioGroupFor(null, null), "category");
  assert.equal(aioGroupFor("도입 검토", "마케팅 자동화"), "category");
  assert.equal(aioGroupFor(undefined, "브랜드 키워드"), "brand");
});
