import assert from "node:assert/strict";
import test from "node:test";
import { applyKeywordPlan, buildKeywordCleanupPrompt, keywordKey, MAX_KEYWORDS_PER_GROUP, parseKeywordCleanup } from "./searchTrendKeywords";

const groups = [
  { groupName: "Adobe", keywords: ["Adobe", "Adobe Firefly", "Adobe Newsroom", "Marcetto", "어도비"] },
  { groupName: "HubSpot", keywords: ["HubSpot", "Marketo HubSpot"] },
];

test("prompt lists every group with its keywords and asks for JSON only", () => {
  const prompt = buildKeywordCleanupPrompt(groups);
  assert.match(prompt, /- Adobe: Adobe, Adobe Firefly, Adobe Newsroom, Marcetto, 어도비/);
  assert.match(prompt, /- HubSpot: HubSpot, Marketo HubSpot/);
  assert.match(prompt, /JSON 하나만/);
});

test("fenced JSON is accepted; kept/added/removed are derived against the original list", () => {
  const raw =
    "다음과 같습니다.\n```json\n" +
    JSON.stringify({
      groups: [
        { name: "Adobe", keywords: ["Adobe", "어도비", "Adobe Systems"], removed: [{ keyword: "Adobe Firefly", reason: "제품명" }, { keyword: "Marcetto", reason: "오타" }] },
        { name: "hubspot", keywords: ["HubSpot", "허브스팟"], removed: [{ keyword: "Marketo HubSpot", reason: "다른 회사 이름이 섞임" }] },
      ],
    }) +
    "\n```";
  const result = parseKeywordCleanup(raw, groups);
  assert.ok("plans" in result);
  const [adobe, hub] = result.plans;
  assert.deepEqual(adobe.kept, ["Adobe", "어도비"]);
  assert.deepEqual(adobe.added, ["Adobe Systems"]);
  assert.deepEqual(adobe.removed.map((r) => [r.keyword, r.reason]), [["Adobe Firefly", "제품명"], ["Adobe Newsroom", undefined], ["Marcetto", "오타"]]);
  assert.equal(hub.groupName, "HubSpot", "이름 대소문자가 달라도 원래 그룹에 매칭한다");
  assert.deepEqual(hub.added, ["허브스팟"]);
});

test("group name is always kept, unknown groups are dropped, cross-group duplicates go to the first owner, and the size cap holds", () => {
  const many = Array.from({ length: 12 }, (_, i) => `k${i}`);
  const raw = JSON.stringify({
    groups: [
      { name: "Adobe", keywords: ["어도비", "HubSpot", ...many] },
      { name: "HubSpot", keywords: ["HubSpot"] },
      { name: "Invented", keywords: ["x"] },
    ],
  });
  const result = parseKeywordCleanup(raw, groups);
  assert.ok("plans" in result);
  const adobe = result.plans.find((p) => p.groupName === "Adobe")!;
  const finalAdobe = [...adobe.kept, ...adobe.added];
  assert.ok(finalAdobe.includes("Adobe"), "주제어는 응답에 없어도 남는다");
  assert.ok(!finalAdobe.includes("HubSpot"), "다른 그룹 이름은 가져가지 못한다");
  assert.ok(finalAdobe.length <= MAX_KEYWORDS_PER_GROUP);
  assert.ok(result.droppedCount >= 1);
  assert.ok(!result.plans.some((p) => p.groupName === "Invented"));
});

test("errors: not JSON, wrong shape, nothing to change", () => {
  assert.deepEqual(parseKeywordCleanup("네", groups), { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." });
  assert.ok("error" in parseKeywordCleanup("{}", groups));
  const same = JSON.stringify({ groups: [{ name: "HubSpot", keywords: ["HubSpot", "Marketo HubSpot"] }] });
  assert.ok("error" in parseKeywordCleanup(same, groups));
});

test("applyKeywordPlan honors per-keyword choices and never drops the group name", () => {
  const raw = JSON.stringify({
    groups: [{ name: "Adobe", keywords: ["어도비", "Adobe Systems"], removed: [{ keyword: "Adobe", reason: "x" }, { keyword: "Adobe Firefly", reason: "제품명" }, { keyword: "Marcetto", reason: "오타" }] }],
  });
  const result = parseKeywordCleanup(raw, groups);
  assert.ok("plans" in result);
  const plan = result.plans[0];
  const applied = applyKeywordPlan(groups[0], plan, { added: new Set(), restored: new Set([keywordKey("Marcetto")]) });
  assert.deepEqual(applied, ["Adobe", "Marcetto", "어도비"].sort((a, b) => groups[0].keywords.indexOf(a) - groups[0].keywords.indexOf(b)));
  const withAdded = applyKeywordPlan(groups[0], plan, { added: new Set([keywordKey("Adobe Systems")]), restored: new Set() });
  assert.ok(withAdded.includes("Adobe Systems") && withAdded.includes("Adobe") && !withAdded.includes("Adobe Firefly"));
});
