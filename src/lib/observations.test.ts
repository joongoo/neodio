import assert from "node:assert/strict";
import test from "node:test";
import { observationWeights, sumWeights } from "./observations";

const run = (id: string, promptId: string, week = "2026-09-06", model = "m", market = "kr") => ({ id, promptId, llmModelId: model, marketId: market, week });

test("같은 주·프롬프트·엔진·마켓의 반복 실행은 합쳐서 1건이 된다", () => {
  const w = observationWeights([run("a", "p1"), run("b", "p1"), run("c", "p1"), run("d", "p2")]);
  assert.equal(sumWeights(["a", "b", "c"], w), 1);
  assert.equal(sumWeights(["d"], w), 1);
  assert.equal(sumWeights(["a", "b", "c", "d"], w), 2);
});

test("주·엔진·마켓이 다르면 별개의 관측", () => {
  const w = observationWeights([run("a", "p1"), run("b", "p1", "2026-09-13"), run("c", "p1", "2026-09-06", "other"), run("d", "p1", "2026-09-06", "m", "us")]);
  assert.equal(sumWeights(["a", "b", "c", "d"], w), 4);
});

test("묶음 안 언급 비율이 관측의 값이 된다 (3번 중 2번 언급 → 0.67)", () => {
  const w = observationWeights([run("a", "p1"), run("b", "p1"), run("c", "p1")]);
  const hit = sumWeights(["a", "b"], w);
  assert.ok(Math.abs(hit - 2 / 3) < 1e-9);
});
