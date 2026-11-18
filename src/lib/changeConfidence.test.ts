import test from "node:test";
import assert from "node:assert/strict";
import { changeConfidence, weeklyConfidence, wilsonInterval } from "./changeConfidence";

test("Wilson 구간: 알려진 값과 경계", () => {
  const w = wilsonInterval(5, 10);
  assert.ok(Math.abs(w.low - 0.2366) < 0.002 && Math.abs(w.high - 0.7634) < 0.002);
  const zero = wilsonInterval(0, 20);
  assert.equal(zero.low, 0);
  assert.ok(zero.high > 0.1 && zero.high < 0.2);
  const all = wilsonInterval(20, 20);
  assert.equal(all.high, 1);
  assert.deepEqual(wilsonInterval(0, 0), { low: 0, high: 1, rate: 0 });
});

test("표본 부족이면 라벨이 insufficient이고 변화율 숫자를 크게 보이지 않는다", () => {
  const r = changeConfidence({ hits: 2, total: 5 }, { hits: 4, total: 6 });
  assert.equal(r.label, "insufficient");
  assert.equal(r.showPercent, false);
  assert.match(r.note, /표본이 적어/);
});

test("같은 비율은 노이즈", () => {
  const r = changeConfidence({ hits: 30, total: 100 }, { hits: 30, total: 100 });
  assert.equal(r.label, "noise");
  assert.equal(r.diffPoints, 0);
  assert.ok(r.ci.low < 0 && r.ci.high > 0);
});

test("작은 변화는 표본이 작으면 노이즈, 크면 유의", () => {
  const small = changeConfidence({ hits: 10, total: 50 }, { hits: 14, total: 50 }); // 20% → 28%
  assert.equal(small.label, "noise");
  const big = changeConfidence({ hits: 200, total: 1000 }, { hits: 280, total: 1000 });
  assert.equal(big.label, "significant");
  assert.ok(big.ci.low > 0);
});

test("큰 하락도 유의로 표시하고 문구에 내렸다고 쓴다", () => {
  const r = changeConfidence({ hits: 60, total: 100 }, { hits: 30, total: 100 });
  assert.equal(r.label, "significant");
  assert.ok(r.diffPoints < 0);
  assert.match(r.note, /내렸어요/);
});

test("이전 값이 0이면 상대 변화율을 보이지 않는다", () => {
  const r = changeConfidence({ hits: 0, total: 40 }, { hits: 12, total: 40 });
  assert.equal(r.showPercent, false);
  assert.equal(r.label, "significant");
});

test("0%·100% 근처에서도 구간이 [-1,1] 안이다", () => {
  const r = changeConfidence({ hits: 0, total: 30 }, { hits: 30, total: 30 });
  assert.ok(r.ci.low >= -100 && r.ci.high <= 100);
  assert.equal(r.label, "significant");
});

test("가중(소수) 표본도 계산된다", () => {
  const r = changeConfidence({ hits: 12.5, total: 40.25 }, { hits: 20.5, total: 41.75 });
  assert.ok(Number.isFinite(r.diffPoints) && Number.isFinite(r.ci.low));
});

test("minSample 옵션", () => {
  assert.equal(changeConfidence({ hits: 3, total: 10 }, { hits: 4, total: 10 }, { minSample: 10 }).label, "noise");
  assert.equal(changeConfidence({ hits: 3, total: 10 }, { hits: 4, total: 10 }).label, "insufficient");
});

test("주별 비교: 첫 주는 null", () => {
  const w = weeklyConfidence([{ hits: 5, total: 30 }, { hits: 6, total: 30 }, { hits: 20, total: 30 }]);
  assert.equal(w[0], null);
  assert.equal(w[1]!.label, "noise");
  assert.equal(w[2]!.label, "significant");
});

// 같은 설정이 이어진 주(실제 변화 없음)에서 "유의"가 나오는 비율 — 이름 그대로 거짓 양성률. 시드 고정 난수.
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const binom = (rnd: () => number, n: number, p: number) => { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; };

test("변화가 없는 연속 주의 거짓 양성률이 약 5% 이하", () => {
  const rnd = mulberry(20261106);
  for (const [n, p] of [[30, 0.3], [60, 0.5], [100, 0.1], [200, 0.45]] as const) {
    let fp = 0;
    const trials = 4000;
    for (let t = 0; t < trials; t++) {
      const r = changeConfidence({ hits: binom(rnd, n, p), total: n }, { hits: binom(rnd, n, p), total: n });
      if (r.label === "significant") fp++;
    }
    const rate = fp / trials;
    assert.ok(rate < 0.07, `n=${n} p=${p} 거짓 양성률 ${rate}`);
  }
});

test("실제로 15%p 오른 경우 표본 100에서 검출력이 충분", () => {
  const rnd = mulberry(7);
  let hit = 0;
  const trials = 2000;
  for (let t = 0; t < trials; t++) {
    const r = changeConfidence({ hits: binom(rnd, 100, 0.3), total: 100 }, { hits: binom(rnd, 100, 0.45), total: 100 });
    if (r.label === "significant") hit++;
  }
  assert.ok(hit / trials > 0.4, `검출력 ${hit / trials}`);
});
