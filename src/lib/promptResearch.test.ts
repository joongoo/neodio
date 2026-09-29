import assert from "node:assert/strict";
import test from "node:test";
import { buildPromptResearchPrompt, parsePromptResearch } from "./promptResearch";

test("prompt names the topic and market", () => {
  const text = buildPromptResearchPrompt("마케팅 자동화", "한국 (KR)");
  assert.match(text, /토픽: "마케팅 자동화"/);
  assert.match(text, /마켓: 한국 \(KR\)/);
});

test("parse builds related topics with stable ids, dedupes and defaults relevancy", () => {
  const raw = "```json\n" + JSON.stringify({
    intent: { informational: 5, commercial: 3, transactional: 1 },
    relatedTopics: [
      { topic: "리드 너처링", relevancy: "Best", prompts: ["리드 너처링은 어떻게 하나요?", "리드 너처링은 어떻게 하나요?", "  도구 추천해줘 "] },
      { topic: "리드 너처링", relevancy: "높음", prompts: ["중복 토픽"] },
      { topic: "CRM 연동", relevancy: "이상한값", prompts: ["CRM 연동 방법"] },
      { topic: "질문 없음", relevancy: "높음", prompts: [] },
    ],
  }) + "\n```";
  const result = parsePromptResearch(raw, "마케팅 자동화");
  assert.ok("relatedTopics" in result);
  assert.deepEqual(result.relatedTopics.map((t) => [t.topic, t.relevancy, t.promptCount]), [["리드 너처링", "Best", 2], ["CRM 연동", "중간", 1]]);
  assert.equal(result.relatedTopics[0].subPrompts[1].prompt, "도구 추천해줘");
  assert.match(result.relatedTopics[0].id, /^pr-마케팅-자동화-0$/);
  assert.deepEqual(result.intent, { informational: 5, commercial: 3, transactional: 1 });
});

test("parse rejects garbage and empty results", () => {
  assert.ok("error" in parsePromptResearch("죄송합니다", "x"));
  assert.ok("error" in parsePromptResearch(JSON.stringify({ relatedTopics: [] }), "x"));
  assert.ok("error" in parsePromptResearch(JSON.stringify({ relatedTopics: [{ topic: "a", prompts: [] }] }), "x"));
});
