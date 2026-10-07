import assert from "node:assert/strict";
import test from "node:test";
import { buildActionDrafts, buildInsights, defaultSections, REPORT_SECTIONS, type ReportKpi, type ReportSnapshot } from "./report";

const kpi = (value: number, direction: "up" | "down" | "flat" = "up", percent = 5): ReportKpi => ({ value, trend: { direction, percent }, trendUnit: "%", sparkline: [] });
const snapshot = (over: Partial<ReportSnapshot> = {}): ReportSnapshot => ({
  version: 1, generatedAt: "2026-10-07T00:00:00Z", brand: { name: "브랜드", domain: "b.com" },
  period: { range: "4w", label: "최근 4주", weekLabels: [] }, filters: { market: "전체", model: "전체", scope: "전체" },
  kpis: { score: kpi(24.9, "up", 3), mention: kpi(27.1), citation: kpi(25.4) },
  engines: [{ label: "Google AI 모드", visibility: 43 }, { label: "Naver AI검색", visibility: 11 }],
  placement: [], competitors: [{ brand: "우리", isSelf: true, mentionRate: 27, citationRate: 25 }, { brand: "경쟁A", isSelf: false, mentionRate: 40, citationRate: 10 }],
  topBrands: [], topics: { strong: [], gaps: [{ topic: "GEO 컨설팅", visibility: 0, runs: 6 }] },
  sources: [{ domain: "zest.co.kr", prompts: 9, myBrandMentions: 0, coMentioned: "Villion 2" }],
  appendix: { measurement: { runs: 123, observations: 120, engines: [], markets: [] }, quality: [], consistency: { pairs: 90, singleRunPairs: 66, repeatedPairs: 24, always: 8, sometimes: 4, never: 12, flaky: [] }, composition: { brandQueryRuns: 0, generalQueryRuns: 123, categories: [] }, registeredCompetitors: [], changes: [], versions: [] },
  ...over,
});

test("인사이트: 점수·엔진·경쟁사·공백·소스를 근거가 있을 때만 문장으로 만든다", () => {
  const lines = buildInsights(snapshot());
  assert.match(lines[0], /24\.9점.*3% 올랐어요.*27\.1%/);
  assert.ok(lines.some((l) => l.includes("Google AI 모드에서 가장 잘 노출") && l.includes("Naver AI검색에서 가장 약해요")));
  assert.ok(lines.some((l) => l.includes("경쟁A의 언급률(40%)이 우리(27%)보다 높아요")));
  assert.ok(lines.some((l) => l.includes("언급되지 않은 토픽이 1개")));
  assert.ok(lines.some((l) => l.includes("zest.co.kr")));
});

test("인사이트: 근거가 없으면 문장을 만들지 않는다", () => {
  const empty = snapshot({ kpis: null, engines: [], competitors: [], topics: { strong: [], gaps: [] }, sources: [] });
  assert.deepEqual(buildInsights(empty), []);
  const one = buildInsights(snapshot({ engines: [{ label: "A", visibility: 10 }] }));
  assert.ok(!one.some((l) => l.includes("엔진별로는")));
  assert.match(buildInsights(snapshot({ kpis: { score: kpi(10, "flat", 0), mention: kpi(5), citation: kpi(5) } }))[0], /직전 기간과 같아요/);
});

test("경쟁사보다 높으면 1위 문장이 나온다", () => {
  const lines = buildInsights(snapshot({ competitors: [{ brand: "우리", isSelf: true, mentionRate: 50, citationRate: 1 }, { brand: "경쟁A", isSelf: false, mentionRate: 20, citationRate: 1 }] }));
  assert.ok(lines.some((l) => l.includes("우리 브랜드의 언급률(50%)이 가장 높아요")));
});

test("실행 제안 초안과 섹션 기본값", () => {
  const drafts = buildActionDrafts(snapshot());
  assert.ok(drafts.some((d) => d.includes("GEO 컨설팅")) && drafts.some((d) => d.includes("zest.co.kr")) && drafts.some((d) => d.includes("Naver AI검색")) && drafts.some((d) => d.includes("반복 수집")));
  const sections = defaultSections(snapshot());
  assert.equal(Object.keys(sections).length, REPORT_SECTIONS.length);
  assert.ok(sections.summary.commentary.startsWith("• ") && sections.actions.commentary.includes("GEO 컨설팅"));
  assert.equal(sections.appendix.commentary, "");
});
