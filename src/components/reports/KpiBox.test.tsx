import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KpiBox } from "./ReportView";
import type { ReportKpi } from "@/lib/report";
import type { ChangeConfidence } from "@/lib/changeConfidence";

const conf = (label: ChangeConfidence["label"]): ChangeConfidence => ({
  label, diffPoints: 4, ci: { low: -3, high: 11 }, previous: { rate: 20, n: 12 }, current: { rate: 24, n: 14 }, showPercent: label !== "insufficient", note: "",
});
const kpi = (confidence?: ChangeConfidence): ReportKpi => ({ value: 24, suffix: "%", trend: { direction: "up", percent: 4 }, trendUnit: "%p", sparkline: [], confidence });
const html = (k: ReportKpi) => renderToStaticMarkup(<KpiBox label="브랜드 언급률" kpi={k} hint="힌트" />);

test("신뢰도가 없는 예전 스냅샷은 기존 표시 그대로", () => {
  const h = html(kpi());
  assert.match(h, /▲ 4%p/);
  assert.match(h, /text-emerald-600/);
});

test("표본 부족이면 비교 보류로 표시하고 상승 색을 쓰지 않는다", () => {
  const h = html(kpi(conf("insufficient")));
  assert.match(h, /표본 적음 · 비교 보류/);
  assert.doesNotMatch(h, /▲|text-emerald-600|4%p/);
});

test("우연 범위 변화는 큰 차이 없음으로 표시한다", () => {
  const h = html(kpi(conf("noise")));
  assert.match(h, /큰 차이 없음/);
  assert.doesNotMatch(h, /▲|text-emerald-600/);
});

test("유의한 변화는 화살표와 색을 그대로 쓴다", () => {
  const h = html(kpi(conf("significant")));
  assert.match(h, /▲ 4%p/);
  assert.match(h, /text-emerald-600/);
});
