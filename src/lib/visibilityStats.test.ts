import assert from "node:assert/strict";
import test from "node:test";
import { pointTrend, pooledRate, weightedAverage } from "./visibilityStats";

test("pooledRate는 프롬프트 수가 늘어도 같은 적중률이면 같은 값", () => {
  assert.equal(pooledRate([{ hit: 3, total: 10 }]), 30);
  assert.equal(pooledRate([{ hit: 30, total: 100 }]), 30);
  assert.equal(pooledRate([{ hit: 3, total: 10 }, { hit: 6, total: 20 }]), 30);
  assert.equal(pooledRate([]), 0);
});

test("weightedAverage는 표본이 큰 그룹에 더 큰 비중을 둔다", () => {
  assert.equal(weightedAverage([{ value: 100, weight: 1 }, { value: 20, weight: 99 }]), 20.8);
  assert.equal(weightedAverage([]), 0);
});

test("pointTrend는 %p 차이를 계산한다", () => {
  assert.deepEqual(pointTrend(35, 30), { direction: "up", percent: 5 });
  assert.deepEqual(pointTrend(25.5, 30), { direction: "down", percent: 4.5 });
  assert.deepEqual(pointTrend(30, undefined), { direction: "flat", percent: 0 });
});
