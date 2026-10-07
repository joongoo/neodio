// 클라이언트 보고용 리포트 — 생성 시점의 지표를 고정(스냅샷)해 저장한다(docs/client-report-plan.md).
// 서버·클라이언트가 함께 쓰는 순수 모듈: 타입, 섹션 정의, 자동 인사이트.
import type { CollectionQualityRow, ConsistencySummary } from "@/lib/db";
import type { PlacementSummary } from "@/lib/placement";

export type ReportRange = "1w" | "2w" | "4w";

export interface ReportKpi {
  value: number;
  decimals?: number;
  suffix?: string;
  /** 직전 기간 대비 증감 — 점수는 상대 %, 비율 지표는 %p. */
  trend: { direction: "up" | "down" | "flat"; percent: number };
  trendUnit: "%" | "%p";
  sparkline: { week: string; value: number }[];
  caption?: string;
}

export interface ReportTopic {
  topic: string;
  /** 가시성(%) — 언급된 관측 비율 */
  visibility: number;
  /** 수집한 실행 수 */
  runs: number;
}

export interface ReportSnapshot {
  version: 1;
  generatedAt: string;
  brand: { name: string; domain: string };
  period: { range: ReportRange; label: string; weekLabels: string[] };
  filters: { market: string; model: string; scope: string };
  kpis: { score: ReportKpi; mention: ReportKpi; citation: ReportKpi } | null;
  engines: { label: string; visibility: number }[];
  placement: PlacementSummary[];
  competitors: { brand: string; isSelf: boolean; mentionRate: number; citationRate: number }[];
  topBrands: { brand: string; mentions: number; totalAnswers: number; isOwn: boolean }[];
  topics: { strong: ReportTopic[]; gaps: ReportTopic[] };
  sources: { domain: string; prompts: number; myBrandMentions: number; coMentioned: string }[];
  appendix: {
    measurement: { runs: number; observations: number; engines: string[]; markets: string[] };
    quality: CollectionQualityRow[];
    consistency: ConsistencySummary | null;
    composition: { brandQueryRuns: number; generalQueryRuns: number; categories: { name: string; runs: number }[] };
    registeredCompetitors: string[];
    changes: { at: string; summary: string; entityType: string }[];
    versions: { version: number; label: string; createdAt: string }[];
  };
}

export type ReportSectionKey = "summary" | "trend" | "engines" | "competitors" | "topics" | "sources" | "actions" | "appendix";

export const REPORT_SECTIONS: { key: ReportSectionKey; title: string; description: string; editableCommentary: boolean }[] = [
  { key: "summary", title: "요약", description: "핵심 지표와 이번 기간의 핵심 인사이트", editableCommentary: true },
  { key: "trend", title: "추이", description: "주별 가시성·언급률·인용률 변화", editableCommentary: true },
  { key: "engines", title: "엔진별 현황", description: "AI 엔진별 가시성과 노출 위치", editableCommentary: true },
  { key: "competitors", title: "경쟁사 비교", description: "비교 대상 대비 언급률과 상위 브랜드", editableCommentary: true },
  { key: "topics", title: "잘되는 점 · 놓치는 점", description: "가시성이 높은 토픽과 아직 언급이 없는 토픽", editableCommentary: true },
  { key: "sources", title: "출처 · 인용", description: "AI가 자주 인용한 소스와 경쟁사만 혜택을 보는 소스", editableCommentary: true },
  { key: "actions", title: "실행 제안", description: "다음 기간에 할 일", editableCommentary: true },
  { key: "appendix", title: "부록 — 측정 방법과 데이터 품질", description: "측정 개요, 지표 정의, 데이터 품질, 해석 가이드, 용어", editableCommentary: false },
];

export interface ReportSectionState {
  included: boolean;
  commentary: string;
}
export type ReportSections = Record<ReportSectionKey, ReportSectionState>;

const trendText = (kpi: ReportKpi, unit: string) =>
  kpi.trend.direction === "flat" ? "직전 기간과 같아요" : `직전 기간보다 ${kpi.trend.percent}${unit} ${kpi.trend.direction === "up" ? "올랐어요" : "내렸어요"}`;

/** 스냅샷에서 핵심 인사이트 초안을 만든다(담당자가 고치거나 지울 수 있다). 근거가 부족한 문장은 만들지 않는다. */
export function buildInsights(s: ReportSnapshot): string[] {
  const out: string[] = [];
  if (s.kpis) {
    out.push(`가시성 점수는 ${s.kpis.score.value.toFixed(1)}점이고 ${trendText(s.kpis.score, "%")}. 수집한 답변 중 ${s.kpis.mention.value.toFixed(1)}%에서 브랜드가 언급되고, ${s.kpis.citation.value.toFixed(1)}%에서 우리 도메인이 출처로 인용됐어요.`);
  }
  const engines = s.engines.filter((e) => Number.isFinite(e.visibility));
  if (engines.length >= 2) {
    const sorted = [...engines].sort((a, b) => b.visibility - a.visibility);
    const best = sorted[0], worst = sorted[sorted.length - 1];
    if (best.visibility !== worst.visibility) out.push(`엔진별로는 ${best.label}에서 가장 잘 노출되고(${best.visibility}%), ${worst.label}에서 가장 약해요(${worst.visibility}%). 엔진마다 답변 방식이 달라서 약한 엔진은 따로 대응이 필요해요.`);
  }
  const self = s.competitors.find((c) => c.isSelf);
  const rivals = s.competitors.filter((c) => !c.isSelf).sort((a, b) => b.mentionRate - a.mentionRate);
  if (self && rivals.length > 0) {
    out.push(rivals[0].mentionRate > self.mentionRate
      ? `비교 대상 중 ${rivals[0].brand}의 언급률(${rivals[0].mentionRate}%)이 우리(${self.mentionRate}%)보다 높아요.`
      : `비교 대상 중 우리 브랜드의 언급률(${self.mentionRate}%)이 가장 높아요. 다음으로 ${rivals[0].brand}가 ${rivals[0].mentionRate}%예요.`);
  }
  if (s.topics.gaps.length > 0) out.push(`아직 한 번도 언급되지 않은 토픽이 ${s.topics.gaps.length}개 이상이에요. 실행 제안의 우선순위 후보예요.`);
  const exposed = s.sources.filter((src) => src.myBrandMentions === 0 && src.coMentioned);
  if (exposed.length > 0) out.push(`경쟁사만 함께 언급되고 우리는 빠진 인용 소스가 ${exposed.length}곳 이상이에요(예: ${exposed[0].domain}).`);
  return out.slice(0, 5);
}

/** 실행 제안 초안 — 스냅샷의 공백에서 바로 할 수 있는 일을 뽑는다. */
export function buildActionDrafts(s: ReportSnapshot): string[] {
  const out: string[] = [];
  const gaps = s.topics.gaps.slice(0, 3).map((t) => `“${t.topic}”`);
  if (gaps.length) out.push(`언급이 없는 토픽(${gaps.join(", ")})에 대해 답변에 인용될 만한 콘텐츠를 만들고 프롬프트 라이브러리에 추가하기`);
  const exposed = s.sources.filter((src) => src.myBrandMentions === 0).slice(0, 2).map((src) => src.domain);
  if (exposed.length) out.push(`${exposed.join(", ")} 같은 출처에서 우리 브랜드가 언급되도록 기고·제휴 가능성 검토하기`);
  const weak = [...s.engines].sort((a, b) => a.visibility - b.visibility)[0];
  if (weak && s.engines.length >= 2) out.push(`${weak.label}에서의 가시성을 높이기 위한 엔진별 질의·콘텐츠 점검하기`);
  const repeats = s.appendix.consistency;
  if (repeats && repeats.singleRunPairs > repeats.repeatedPairs) out.push("한 번만 수집된 질의를 며칠 간격으로 반복 수집해서 결과의 신뢰도 높이기");
  return out;
}

/** 새 보고서의 섹션 기본값 — 요약·실행 제안은 자동 초안을 코멘트로 채운다. */
export function defaultSections(s: ReportSnapshot): ReportSections {
  const base = Object.fromEntries(REPORT_SECTIONS.map((sec) => [sec.key, { included: true, commentary: "" }])) as ReportSections;
  base.summary.commentary = buildInsights(s).map((line) => `• ${line}`).join("\n");
  base.actions.commentary = buildActionDrafts(s).map((line) => `• ${line}`).join("\n");
  return base;
}

export const RANGE_LABEL: Record<ReportRange, string> = { "1w": "최근 1주", "2w": "최근 2주", "4w": "최근 4주" };
