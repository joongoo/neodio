import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibilityScores, calculateVisibilityTotal, mentionProminence } from "./visibility";
import type { BrandSeed, MentionSeed, PromptRunSeed } from "@/lib/db/types";

const brand: BrandSeed = { id: "own", organizationId: "o", name: "자사", domain: "own.com", isOwnBrand: true, status: "active", category: "", aliases: [] };
const run = (n: number): PromptRunSeed => ({
  id: `r${n}`, promptId: "p", llmModelId: "m", marketId: "kr", runAt: "2026-09-02T00:00:00Z", status: "success", rawResponse: "", rawMetadata: { source: "api" },
});
const mention = (n: number, extra: Partial<MentionSeed> = {}): MentionSeed => ({
  id: `m${n}`, promptRunId: `r${n}`, brandId: "own", isPresent: true, position: 1, offsetRatio: 0, othersPresent: 1, sentiment: "positive", sentimentScore: 0.78, ...extra,
});

test("혼자 나온 답변은 순서가 아니라 답변 내 위치만 본다", () => {
  assert.equal(mentionProminence({ position: 1, offsetRatio: 0.8, othersPresent: 0 }), 0.19999999999999996);
  assert.equal(mentionProminence({ position: 1, offsetRatio: 0, othersPresent: 2 }), 1);
  assert.equal(mentionProminence({ position: 3, offsetRatio: 1, othersPresent: 2 }), 0.275);
});

test("위치 정보가 없는 예전 분석은 순서만 쓴다", () => {
  assert.equal(mentionProminence({ position: 2, offsetRatio: null, othersPresent: 0 }), 0.75);
});

test("100개 중 1개만 언급되면 점수가 낮다(조건부 평균으로 부풀지 않는다)", () => {
  const runs = Array.from({ length: 100 }, (_, i) => run(i));
  const [score] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions: [mention(0)], citations: [] });
  assert.ok(score.totalScore < 3, `총점 ${score.totalScore}`);
});

test("같은 주 반복 실행은 관측 1건으로 합쳐 가중한다", () => {
  // p1을 4번(1번만 언급), p2를 1번(언급) 수집 — 실행 기준 2/5=40%, 관측 기준 (0.25+1)/2=62.5%
  const mk = (id: string, promptId: string) => ({ ...run(0), id, promptId });
  const runs = [mk("a", "p1"), mk("b", "p1"), mk("c", "p1"), mk("d", "p1"), mk("e", "p2")];
  const mentions = [mention(0, { promptRunId: "a" }), mention(1, { promptRunId: "e" })];
  const [byRun] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions, citations: [] });
  const weights = new Map([["a", 0.25], ["b", 0.25], ["c", 0.25], ["d", 0.25], ["e", 1]]);
  const [byObservation] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions, citations: [], runWeights: weights });
  assert.equal(byRun.mentionsScore, 40);
  assert.equal(byObservation.mentionsScore, 63); // 62.5 반올림
});

test("총점은 언급 45%·인용 20%·위치 35%이고 감성은 반영하지 않는다", () => {
  const runs = Array.from({ length: 10 }, (_, i) => run(i));
  const base = runs.map((_, i) => mention(i, { sentiment: "positive", sentimentScore: 0.78 }));
  const negative = runs.map((_, i) => mention(i, { sentiment: "negative", sentimentScore: 0.25 }));
  const [a] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions: base, citations: [] });
  const [b] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions: negative, citations: [] });
  assert.equal(a.totalScore, b.totalScore);
  assert.equal(calculateVisibilityTotal({ mentionsScore: 100, citationsScore: 100, positionScore: 100 }), 100);
});

test("모든 답변에서 맨 앞에 언급되면 높다", () => {
  const runs = Array.from({ length: 10 }, (_, i) => run(i));
  const mentions = runs.map((_, i) => mention(i));
  const [score] = buildVisibilityScores({ organizationId: "o", brand, runs, mentions, citations: [] });
  assert.ok(score.totalScore > 60, `총점 ${score.totalScore}`);
});
