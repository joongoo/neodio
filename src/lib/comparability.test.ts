import test from "node:test";
import assert from "node:assert/strict";
import { breakWeeks, changedParts, compareWeeks, comparableSegments, hashPrompt, makeKey, type WeekInput } from "./comparability";

const key = (text: string, over: Partial<{ engine: string; market: string; collectorVersion: string; ruleVersion: string }> = {}) =>
  makeKey({ promptText: text, engine: "chatgpt", market: "kr", collectorVersion: "c1", ruleVersion: "r1", ...over });
const week = (w: string, n: number, make: (i: number) => ReturnType<typeof key>, slotPrefix = "p"): WeekInput => ({ week: w, slots: Array.from({ length: n }, (_, i) => ({ slot: `${slotPrefix}${i}`, key: make(i) })) });

test("프롬프트 해시: 공백·대소문자·전각 차이는 같은 질문", () => {
  assert.equal(hashPrompt("B2B  CRM 추천해줘"), hashPrompt(" b2b crm 추천해줘 "));
  assert.equal(hashPrompt("ＣＲＭ"), hashPrompt("crm"));
  assert.notEqual(hashPrompt("CRM 추천"), hashPrompt("CRM 비교"));
});

test("바뀐 부분 목록", () => {
  assert.deepEqual(changedParts(key("a"), key("a")), []);
  assert.deepEqual(changedParts(key("a"), key("a", { ruleVersion: "r2" })), ["ruleVersion"]);
  assert.deepEqual(changedParts(key("a"), key("b", { market: "us" })).sort(), ["market", "promptHash"]);
});

test("같은 조건이면 comparable, 첫 주는 first", () => {
  const r = compareWeeks([week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(`q${i}`))]);
  assert.equal(r[0].status, "first");
  assert.equal(r[1].status, "comparable");
  assert.equal(r[1].compared, 10);
});

test("프롬프트가 20% 이상 바뀌면 단절", () => {
  const r = compareWeeks([week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(i < 3 ? `새질문${i}` : `q${i}`))]);
  assert.equal(r[1].status, "break");
  assert.equal(r[1].requiredChanged, 3);
  assert.deepEqual(breakWeeks(r), ["w2"]);
  assert.match(r[1].note, /3\/10/);
});

test("적게 바뀌면 이어서 비교 가능", () => {
  const r = compareWeeks([week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(i === 0 ? "다른 질문" : `q${i}`))]);
  assert.equal(r[1].status, "comparable");
  assert.match(r[1].note, /1\/10/);
});

test("분석 규칙 버전만 바뀌면 단절이 아니라 경고", () => {
  const r = compareWeeks([week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(`q${i}`, { ruleVersion: "r2" }))]);
  assert.equal(r[1].status, "warn");
  assert.equal(r[1].byPart.ruleVersion, 10);
  assert.equal(r[1].requiredChanged, 0);
  assert.deepEqual(breakWeeks(r), []);
});

test("엔진·마켓 변경은 필수 부분이라 단절", () => {
  const r = compareWeeks([week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(`q${i}`, { engine: "gemini" }))]);
  assert.equal(r[1].status, "break");
  assert.equal(r[1].byPart.engine, 10);
});

test("겹치는 슬롯이 적어도 전체 규모가 작으면 판정 보류", () => {
  const r = compareWeeks([week("w1", 3, (i) => key(`q${i}`)), week("w2", 4, (i) => key(`q${i}`))]);
  assert.equal(r[1].status, "insufficient");
  assert.equal(r[1].compared, 3);
  assert.equal(r[1].added, 1);
  const r2 = compareWeeks([week("w1", 8, (i) => key(`q${i}`)), week("w2", 6, (i) => key(`q${i}`))]);
  assert.equal(r2[1].removed, 2);
  assert.equal(r2[1].status, "comparable");
});

test("질문 구성이 통째로 바뀌면 판정 보류가 아니라 구성 변동(shifted)", () => {
  const r = compareWeeks([week("w1", 30, (i) => key(`old${i}`), "a"), week("w2", 20, (i) => key(`new${i}`), "b")]);
  assert.equal(r[1].compared, 0);
  assert.equal(r[1].added, 20);
  assert.equal(r[1].removed, 30);
  assert.equal(r[1].status, "shifted");
  assert.match(r[1].note, /구성이 크게 달라졌어요/);
  assert.deepEqual(breakWeeks(r), []);
  // 처음 소규모로 시작해 확장한 경우도 구성 변동
  assert.equal(compareWeeks([week("w1", 5, (i) => key(`q${i}`)), week("w2", 80, (i) => key(`q${i}`))])[1].status, "shifted");
});

test("구간 나누기: 단절 주에서 새 구간", () => {
  const ws = [
    week("w1", 10, (i) => key(`q${i}`)),
    week("w2", 10, (i) => key(`q${i}`)),
    week("w3", 10, (i) => key(`x${i}`)),
    week("w4", 10, (i) => key(`x${i}`)),
  ];
  const r = compareWeeks(ws);
  assert.deepEqual(comparableSegments(r), [["w1", "w2"], ["w3", "w4"]]);
});

test("옵션: 임계값 조정", () => {
  const ws = [week("w1", 10, (i) => key(`q${i}`)), week("w2", 10, (i) => key(i < 3 ? `n${i}` : `q${i}`))];
  assert.equal(compareWeeks(ws, { breakShare: 0.5 })[1].status, "comparable");
  assert.equal(compareWeeks(ws, { breakShare: 0.1 })[1].status, "break");
});

test("같은 슬롯에서 질문이 바뀌면 단절, 슬롯 자체가 바뀌면 구성 변동", () => {
  const edited = compareWeeks([week("w1", 20, (i) => key(`q${i}`)), week("w2", 20, (i) => key(`edited${i}`))]);
  assert.equal(edited[1].status, "break");
  const rotated = compareWeeks([week("w1", 20, (i) => key(`q${i}`), "a"), week("w2", 20, (i) => key(`q${i}`), "b")]);
  assert.equal(rotated[1].status, "shifted");
});
