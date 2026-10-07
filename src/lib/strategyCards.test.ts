import test from "node:test";
import assert from "node:assert/strict";
import { buildStrategyPrompt, parseStrategyCards } from "./strategyCards";

const card = { tag: "coverage_gap", title: "제목", summary: "요약", stat: "+20%", topics: [{ prompt: "마케팅 자동화 도입 순서는?", category: "How-to", topic: "마케팅 자동화" }] };

test("parseStrategyCards accepts fenced JSON and assigns ids by kind", () => {
  const parsed = parseStrategyCards("```json\n" + JSON.stringify([card]) + "\n```", "trend", 1);
  assert.ok("cards" in parsed);
  assert.equal(parsed.cards[0].id, "trend-1-0");
  assert.equal(parsed.cards[0].topics[0].topic, "마케팅 자동화");
});

test("parseStrategyCards rejects bad tags, empty topics and non-JSON", () => {
  assert.ok("error" in parseStrategyCards(JSON.stringify([{ ...card, tag: "other" }]), "sitemap"));
  assert.ok("error" in parseStrategyCards(JSON.stringify([{ ...card, topics: [] }]), "sitemap"));
  assert.ok("error" in parseStrategyCards("죄송합니다", "trend"));
});

test("buildStrategyPrompt embeds digest and warns that trend values are relative", () => {
  const trend = buildStrategyPrompt("trend", "DIGEST", "TOPICS");
  assert.match(trend, /DIGEST/);
  assert.match(trend, /상대값/);
  assert.match(buildStrategyPrompt("sitemap", "DIGEST", "TOPICS"), /페이지 주소는 주제 파악의 단서/);
});

test("카드의 질문은 마침표·괄호 없는 검색어 형태로 정리하고 프롬프트에 규칙을 넣는다", () => {
  assert.match(buildStrategyPrompt("trend", "digest", ""), /마침표\(\.\)와 괄호/);
  const parsed = parseStrategyCards(JSON.stringify([{ ...card, topics: [{ ...card.topics[0], prompt: "자동화 도구 비교(가격 포함)." }] }]), "trend", 1);
  assert.ok("cards" in parsed);
  assert.equal(parsed.cards[0].topics[0].prompt, "자동화 도구 비교");
});
