import assert from "node:assert/strict";
import test from "node:test";
import { brandQueryKeywords, queryScopeOf } from "./queryScope";

const keywords = brandQueryKeywords({ name: "네오다임", domain: "www.neodigm.co.kr", aliases: ["Neodigm"] });

test("브랜드 이름·별칭·도메인 라벨이 키워드가 된다", () => {
  assert.ok(keywords.includes("네오다임"));
  assert.ok(keywords.includes("neodigm"));
});

test("브랜드명이 들어간 질의는 brand, 아니면 nonbrand", () => {
  assert.equal(queryScopeOf("네오다임 마케팅 자동화", keywords), "brand");
  assert.equal(queryScopeOf("네오 다임 후기", keywords), "brand"); // 공백 무시
  assert.equal(queryScopeOf("NEODIGM marketo partner", keywords), "brand");
  assert.equal(queryScopeOf("마케팅 자동화 솔루션 추천", keywords), "nonbrand");
});

test("질의가 비어 있으면 판단하지 않는다", () => {
  assert.equal(queryScopeOf(undefined, keywords), null);
  assert.equal(queryScopeOf("  ", keywords), null);
});
