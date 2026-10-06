import assert from "node:assert/strict";
import test from "node:test";
import { bestLagCorrelation, computeSignals, defaultDateRange, fillPeriods, normalizeTo100, shareByPeriod, toPromptContext, TrendResult } from "./searchTrend";

const monthly: TrendResult = {
  startDate: "2026-01-01",
  endDate: "2026-06-01",
  timeUnit: "month",
  series: [
    { groupName: "A", keywords: ["a"], data: [10, 20, 40, 60, 80, 100].map((ratio, i) => ({ period: `2026-0${i + 1}-01`, ratio })) },
    // B는 네이버가 검색량 적은 구간(1·2·6월)을 응답에서 뺀 상황
    { groupName: "B", keywords: ["b"], data: [{ period: "2026-03-01", ratio: 20 }, { period: "2026-04-01", ratio: 20 }, { period: "2026-05-01", ratio: 20 }] },
  ],
};

test("fillPeriods gives every group the same axis and fills missing periods with 0", () => {
  const filled = fillPeriods(monthly);
  assert.equal(filled.series[0].data.length, 6);
  assert.deepEqual(filled.series[1].data.map((d) => d.ratio), [0, 0, 20, 20, 20, 0]);
  assert.deepEqual(filled.series[1].data.map((d) => d.period), filled.series[0].data.map((d) => d.period));
});

test("fillPeriods steps by week and crosses year boundaries", () => {
  const weekly: TrendResult = {
    startDate: "2025-12-15",
    endDate: "2026-01-05",
    timeUnit: "week",
    series: [{ groupName: "A", keywords: [], data: [{ period: "2025-12-15", ratio: 1 }, { period: "2026-01-05", ratio: 2 }] }],
  };
  assert.deepEqual(fillPeriods(weekly).series[0].data.map((d) => d.period), ["2025-12-15", "2025-12-22", "2025-12-29", "2026-01-05"]);
});

test("computeSignals: momentum, peak and interest share", () => {
  const [a, b] = computeSignals(fillPeriods(monthly));
  assert.equal(a.peak.period, "2026-06-01");
  assert.equal(a.latest, 100);
  assert.equal(a.momentum, "rising");
  // k = floor(6/4) = 1 → 마지막 100 vs 직전 80
  assert.equal(a.changePercent, 25);
  assert.equal(b.momentum, "falling", "마지막 구간이 0으로 채워져 직전 20보다 낮다");
  assert.ok(Math.abs(a.interestShare + b.interestShare - 1) < 1e-9);
});

test("computeSignals: no change rate without a previous window or when previous is 0", () => {
  const single: TrendResult = { startDate: "", endDate: "", timeUnit: "month", series: [{ groupName: "A", keywords: [], data: [{ period: "2026-01-01", ratio: 50 }] }] };
  assert.equal(computeSignals(single)[0].changePercent, null);
  assert.equal(computeSignals(single)[0].momentum, "stable");
});

test("computeSignals: a group with no data is flagged instead of reported as stable", () => {
  const empty: TrendResult = { startDate: "", endDate: "", timeUnit: "month", series: [{ groupName: "Z", keywords: [], data: [{ period: "2026-01-01", ratio: 0 }, { period: "2026-02-01", ratio: 0 }] }] };
  const [z] = computeSignals(empty);
  assert.equal(z.momentum, "none");
  assert.equal(z.peak.period, "");
});

test("shareByPeriod sums to ~100 per period", () => {
  const rows = shareByPeriod(fillPeriods(monthly));
  for (const row of rows) {
    const total = Number(row.A) + Number(row.B);
    assert.ok(total === 0 || Math.abs(total - 100) < 0.2);
  }
});

test("normalizeTo100 rescales to max 100 and handles all-zero", () => {
  assert.deepEqual(normalizeTo100([2, 4, 1]), [50, 100, 25]);
  assert.deepEqual(normalizeTo100([0, 0]), [0, 0]);
});

test("bestLagCorrelation finds a 2-period lead and refuses short series", () => {
  const search = [1, 3, 2, 5, 4, 8, 6, 9, 7, 10, 8, 12];
  const mentions = [0, 0, ...search.slice(0, -2)]; // 언급이 검색보다 2구간 늦다
  const best = bestLagCorrelation(search, mentions);
  assert.equal(best?.lag, 2);
  assert.ok((best?.r ?? 0) > 0.99);
  assert.equal(bestLagCorrelation([1, 2, 3], [1, 2, 3]), null);
});

test("bestLagCorrelation은 null(수집 부족) 주를 짝에서 빼고 남은 짝으로 계산한다", () => {
  const search = [1, 3, 2, 5, 4, 8, 6, 9, 7, 10, 8, 12];
  const mentions: (number | null)[] = [...search];
  mentions[3] = null;
  const best = bestLagCorrelation(search, mentions);
  assert.equal(best?.lag, 0);
  assert.equal(best?.n, 11);
  // 값이 있는 짝이 부족하면 계산하지 않는다
  const sparse: (number | null)[] = search.map((v, i) => (i < 5 ? v : null));
  assert.equal(bestLagCorrelation(search, sparse), null);
});

test("toPromptContext produces a compact one-line summary", () => {
  const filled = fillPeriods(monthly);
  const text = toPromptContext(filled, computeSignals(filled));
  assert.match(text, /^네이버 검색 관심도\(상대값, 2026-01-01~2026-06-01, month\): A 상승\(\+25%, 점유 \d+%\), B 하락/);
});

test("defaultDateRange spans the expected window per unit", () => {
  const today = new Date("2026-09-29T10:00:00Z");
  assert.deepEqual(defaultDateRange("month", today), { startDate: "2025-09-29", endDate: "2026-09-29" });
  assert.deepEqual(defaultDateRange("week", today), { startDate: "2026-03-31", endDate: "2026-09-29" });
  assert.deepEqual(defaultDateRange("date", today), { startDate: "2026-07-01", endDate: "2026-09-29" });
});
