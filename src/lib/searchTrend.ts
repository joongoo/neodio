// 네이버 데이터랩 검색어 트렌드 응답을 화면·프롬프트·가시성 화면이 함께 쓰는 지표로 바꾸는 순수 함수 모음.
// 서버 전용 import가 없어 클라이언트 컴포넌트와 서버 코드 양쪽에서 쓸 수 있다.
//
// 전제: API의 ratio는 "요청 하나 안에서 최댓값=100"인 상대값이다. 그래서
//  - 같은 요청의 그룹끼리는 비교·점유율 계산이 유효하지만,
//  - 다른 요청(기기·성별·연령 분해 등)의 값끼리는 크기를 비교할 수 없고 추이의 모양만 비교한다.

export type TrendTimeUnit = "date" | "week" | "month";

export interface TrendPoint {
  period: string;
  ratio: number;
}

export interface TrendSeries {
  groupName: string;
  keywords: string[];
  data: TrendPoint[];
}

export interface TrendResult {
  startDate: string;
  endDate: string;
  timeUnit: TrendTimeUnit;
  series: TrendSeries[];
}

export type TrendMomentum = "rising" | "falling" | "stable" | "none";

export interface TrendSignal {
  groupName: string;
  keywords: string[];
  /** 가장 최근 구간의 ratio. */
  latest: number;
  average: number;
  peak: { period: string; ratio: number };
  /** 최근 구간 평균 대비 직전 같은 길이 구간 평균의 변화율(%). 비교 구간이 없거나 직전이 0이면 null. */
  changePercent: number | null;
  momentum: TrendMomentum;
  /** 같은 요청의 모든 그룹 합 대비 이 그룹의 비중(0~1) — 그룹 간 상대 관심도. */
  interestShare: number;
  /** 변동계수(표준편차/평균). 클수록 들쭉날쭉하다. */
  volatility: number;
}

const MOMENTUM_THRESHOLD_PERCENT = 15;

function addUnit(period: string, unit: TrendTimeUnit): string {
  const d = new Date(`${period}T00:00:00.000Z`);
  if (unit === "date") d.setUTCDate(d.getUTCDate() + 1);
  else if (unit === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

/** 네이버는 검색량이 너무 적은 구간을 응답에서 빼므로, 빠진 구간을 0으로 채워 모든 그룹이 같은 구간축을 갖게 한다. */
export function fillPeriods(result: TrendResult): TrendResult {
  const all = result.series.flatMap((s) => s.data.map((d) => d.period)).sort();
  if (all.length === 0) return result;
  const periods: string[] = [];
  for (let p = all[0], guard = 0; p <= all[all.length - 1] && guard < 4000; p = addUnit(p, result.timeUnit), guard++) periods.push(p);
  return {
    ...result,
    series: result.series.map((s) => {
      const byPeriod = new Map(s.data.map((d) => [d.period, d.ratio]));
      return { ...s, data: periods.map((period) => ({ period, ratio: byPeriod.get(period) ?? 0 })) };
    }),
  };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** 모든 그룹의 구간축이 같다고 가정(fillPeriods 이후)한 그룹별 요약 지표. */
export function computeSignals(result: TrendResult): TrendSignal[] {
  const totalSum = result.series.reduce((sum, s) => sum + s.data.reduce((a, d) => a + d.ratio, 0), 0);
  return result.series.map((s) => {
    const values = s.data.map((d) => d.ratio);
    const n = values.length;
    const avg = mean(values);
    const peakPoint = s.data.reduce<TrendPoint>((best, d) => (d.ratio > best.ratio ? d : best), s.data[0] ?? { period: "", ratio: 0 });

    // 비교 구간 길이: 전체의 1/4, 최소 1 최대 3 — 짧은 기간에서도 "최근 vs 직전"이 나오게.
    const k = Math.min(3, Math.max(1, Math.floor(n / 4)));
    let changePercent: number | null = null;
    if (n >= k * 2) {
      const recent = mean(values.slice(-k));
      const previous = mean(values.slice(-k * 2, -k));
      if (previous > 0) changePercent = Math.round(((recent - previous) / previous) * 100);
    }
    const hasData = values.some((v) => v > 0);
    const momentum: TrendMomentum = !hasData
      ? "none"
      : changePercent === null || Math.abs(changePercent) < MOMENTUM_THRESHOLD_PERCENT ? "stable" : changePercent > 0 ? "rising" : "falling";

    const variance = mean(values.map((v) => (v - avg) ** 2));
    return {
      groupName: s.groupName,
      keywords: s.keywords,
      latest: n ? values[n - 1] : 0,
      average: Math.round(avg * 10) / 10,
      peak: hasData ? { period: peakPoint?.period ?? "", ratio: peakPoint?.ratio ?? 0 } : { period: "", ratio: 0 },
      changePercent,
      momentum,
      interestShare: totalSum > 0 ? values.reduce((a, b) => a + b, 0) / totalSum : 0,
      volatility: avg > 0 ? Math.round((Math.sqrt(variance) / avg) * 100) / 100 : 0,
    };
  });
}

/** 구간별 그룹 점유율(%) — 같은 요청의 그룹 합을 100으로 본 상대 관심도. */
export function shareByPeriod(result: TrendResult): Record<string, number | string>[] {
  const periods = result.series[0]?.data.map((d) => d.period) ?? [];
  return periods.map((period, i) => {
    const total = result.series.reduce((sum, s) => sum + (s.data[i]?.ratio ?? 0), 0);
    const row: Record<string, number | string> = { period };
    for (const s of result.series) row[s.groupName] = total > 0 ? Math.round(((s.data[i]?.ratio ?? 0) / total) * 1000) / 10 : 0;
    return row;
  });
}

export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => mean(values.slice(Math.max(0, i - window + 1), i + 1)));
}

/** 최댓값이 100이 되도록 다시 맞춘다(서로 다른 단위의 시계열을 한 축에 겹칠 때). */
export function normalizeTo100(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return max > 0 ? values.map((v) => Math.round((v / max) * 1000) / 10) : values.map(() => 0);
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const x = a.slice(0, n);
  const y = b.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

export interface LagCorrelation {
  lag: number;
  r: number;
  n: number;
}

export const MIN_CORRELATION_POINTS = 8;

/**
 * 검색 관심도(search)가 LLM 언급(mentions)보다 lag 구간 앞서 움직였는지 본다.
 * lag>0: 검색이 먼저(검색 → 몇 구간 뒤 AI 언급), lag<0: AI 언급이 먼저. 값이 있는(null 아닌) 짝이 8개 미만이면 null.
 * 언급은 개수가 아니라 비율(언급 답변/수집 답변)을 넘긴다 — 개수는 주별 수집량에 따라 달라져 가짜 상관이 생긴다.
 */
export function bestLagCorrelation(search: (number | null)[], mentions: (number | null)[], maxLag = 4): LagCorrelation | null {
  let best: LagCorrelation | null = null;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const s = lag >= 0 ? search.slice(0, search.length - lag) : search.slice(-lag);
    const m = lag >= 0 ? mentions.slice(lag) : mentions.slice(0, mentions.length + lag);
    // 수집이 너무 적어 값이 없는(null) 주는 짝에서 뺀다 — 0으로 채우면 가짜 상관이 생긴다.
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < Math.min(s.length, m.length); i++) {
      if (s[i] === null || m[i] === null) continue;
      xs.push(s[i] as number);
      ys.push(m[i] as number);
    }
    if (xs.length < MIN_CORRELATION_POINTS) continue;
    const r = pearson(xs, ys);
    if (r === null) continue;
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { lag, r: Math.round(r * 100) / 100, n: xs.length };
  }
  return best;
}

const MOMENTUM_LABEL: Record<TrendMomentum, string> = { rising: "상승", falling: "하락", stable: "보합", none: "집계 없음" };
export const momentumLabel = (m: TrendMomentum) => MOMENTUM_LABEL[m];

/** 화면 요약 문장. */
export function describeSignal(signal: TrendSignal, unit: TrendTimeUnit): string {
  if (signal.momentum === "none") return `"${signal.groupName}"은(는) 이 기간에 집계된 검색량이 없습니다(검색량이 너무 적으면 네이버가 값을 주지 않습니다).`;
  const unitLabel = unit === "date" ? "일" : unit === "week" ? "주" : "개월";
  const change =
    signal.changePercent === null
      ? "비교할 직전 구간이 없어 변화율은 계산하지 않았습니다"
      : `최근 구간이 직전 구간보다 ${Math.abs(signal.changePercent)}% ${signal.changePercent >= 0 ? "높습니다" : "낮습니다"}`;
  return `"${signal.groupName}"은(는) ${signal.peak.period}에 관심도가 가장 높았고(${unitLabel} 단위), ${change}.`;
}

/**
 * 프롬프트·가시성 화면에 그대로 붙일 수 있는 한 줄 컨텍스트.
 * 예) 네이버 검색 관심도(상대값, 2026-03-01~2026-09-29): 네오다임 상승(+18%, 점유 62%), HubSpot 보합(+2%, 점유 38%)
 */
export function toPromptContext(result: TrendResult, signals: TrendSignal[]): string {
  const parts = signals.map((s) => {
    const change = s.changePercent === null ? "변화율 없음" : `${s.changePercent >= 0 ? "+" : ""}${s.changePercent}%`;
    return `${s.groupName} ${momentumLabel(s.momentum)}(${change}, 점유 ${Math.round(s.interestShare * 100)}%)`;
  });
  return `네이버 검색 관심도(상대값, ${result.startDate}~${result.endDate}, ${result.timeUnit}): ${parts.join(", ")}`;
}

// ---- 조회 조건 ----

export const AGE_BUCKETS = [
  { id: "1-2", label: "0~18세", codes: ["1", "2"] },
  { id: "3", label: "19~24세", codes: ["3"] },
  { id: "4-5", label: "25~34세", codes: ["4", "5"] },
  { id: "6-7", label: "35~44세", codes: ["6", "7"] },
  { id: "8-9", label: "45~54세", codes: ["8", "9"] },
  { id: "10-11", label: "55세 이상", codes: ["10", "11"] },
] as const;

export function defaultDateRange(timeUnit: TrendTimeUnit, today = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end);
  if (timeUnit === "date") start.setUTCDate(start.getUTCDate() - 90);
  else if (timeUnit === "week") start.setUTCDate(start.getUTCDate() - 26 * 7);
  else start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}
