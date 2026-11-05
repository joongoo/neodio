import test from "node:test";
import assert from "node:assert/strict";
import { BOT_ENTRIES, DEFAULT_REGISTRY, RANGE_SOURCES, REGISTRY_VERSION, createRegistry, validateRegistry } from "./registry";
import { matchBot } from "./uaMatch";

test("기본 레지스트리는 일관성 점검을 통과한다", () => {
  assert.deepEqual(validateRegistry(DEFAULT_REGISTRY), []);
  assert.match(REGISTRY_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

test("일관성 점검이 실제로 문제를 잡는다", () => {
  const dup = createRegistry([BOT_ENTRIES[0], { ...BOT_ENTRIES[0] }], RANGE_SOURCES);
  assert.ok(validateRegistry(dup).some((p) => p.includes("중복 id")));
  assert.ok(validateRegistry(dup).some((p) => p.includes("중복 토큰")));

  const missingSource = createRegistry([{ ...BOT_ENTRIES[0], rangeSourceIds: ["없는목록"] }], RANGE_SOURCES);
  assert.ok(validateRegistry(missingSource).some((p) => p.includes("없는 범위 출처")));

  const wrongOperator = createRegistry([{ ...BOT_ENTRIES[0], rangeSourceIds: ["anthropic-bots"] }], RANGE_SOURCES);
  assert.ok(validateRegistry(wrongOperator).some((p) => p.includes("운영사가 다른")));

  const badDate = createRegistry([{ ...BOT_ENTRIES[0], checkedAt: "어제" }], RANGE_SOURCES);
  assert.ok(validateRegistry(badDate).some((p) => p.includes("checkedAt")));
});

test("조사로 확인한 핵심 분류가 맞다", () => {
  const byId = new Map(BOT_ENTRIES.map((e) => [e.id, e]));
  assert.equal(byId.get("openai-gptbot")?.purpose, "training");
  assert.equal(byId.get("openai-searchbot")?.purpose, "search-index");
  assert.equal(byId.get("openai-chatgpt-user")?.purpose, "user-fetch");
  assert.equal(byId.get("openai-chatgpt-user")?.obeysRobots, "no");
  assert.equal(byId.get("anthropic-claudebot")?.purpose, "training");
  assert.equal(byId.get("anthropic-user")?.purpose, "user-fetch");
  assert.equal(byId.get("perplexity-user")?.purpose, "user-fetch");
  assert.equal(byId.get("google-adsbot")?.purpose, "ads-check");
});

test("Anthropic 세 봇은 봇을 구분하지 않는 같은 목록을 쓴다(목적은 UA로만 구분)", () => {
  const anthropic = BOT_ENTRIES.filter((e) => e.operator === "Anthropic");
  assert.equal(anthropic.length, 3);
  for (const e of anthropic) assert.deepEqual(e.rangeSourceIds, ["anthropic-bots"]);
});

test("네이버 검색로봇은 공개 목록이 없고 확신이 낮다고 표시된다", () => {
  const yeti = BOT_ENTRIES.find((e) => e.id === "naver-yeti");
  assert.ok(yeti);
  assert.deepEqual(yeti?.rangeSourceIds, []);
  assert.equal(yeti?.confidence, "low");
});

test("직접 받아 본 목록만 urlVerified=true", () => {
  const verified = RANGE_SOURCES.filter((s) => s.urlVerified).map((s) => s.id).sort();
  assert.deepEqual(verified, ["anthropic-bots", "google-googlebot", "openai-gptbot", "perplexity-bot"]);
  // 경로를 모르는 목록은 URL을 비워 둔다(추측해 넣지 않는다)
  for (const s of RANGE_SOURCES) if (!s.urlVerified && s.url === null) assert.ok(s.note, `${s.id}: 이유를 적어야 함`);
});

test("모든 항목이 자기 UA 샘플에서 자기 자신으로만 매칭된다(토큰 간 충돌 없음)", () => {
  for (const e of BOT_ENTRIES) {
    const hit = matchBot(`Mozilla/5.0 (compatible; ${e.uaToken}/1.0; +https://example.com/bot)`, BOT_ENTRIES);
    assert.equal(hit?.id, e.id, `${e.uaToken}`);
  }
});
