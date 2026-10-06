// 수집 양(프롬프트 수)에 따라 값이 커지지 않도록, 대시보드 지표를 "비율"과
// "실행 수 가중 평균"으로 계산하는 순수 함수 모음.

/** 최소 이 정도 실행이 있어야 비율 지표를 신뢰할 만하다고 본다. */
export const MIN_RELIABLE_RUNS = 10;

/** 여러 주/그룹의 (분자, 분모)를 합산한 비율(%). 분모가 0이면 0. */
export function pooledRate(parts: { hit: number; total: number }[]): number {
  const total = parts.reduce((s, p) => s + p.total, 0);
  if (total === 0) return 0;
  const hit = parts.reduce((s, p) => s + p.hit, 0);
  return Number(((hit / total) * 100).toFixed(1));
}

/** 가중 평균 — 실행 1건짜리 그룹과 100건짜리 그룹이 같은 비중으로 섞이지 않게 한다. */
export function weightedAverage(items: { value: number; weight: number }[]): number {
  const weight = items.reduce((s, i) => s + i.weight, 0);
  if (weight === 0) return 0;
  return Number((items.reduce((s, i) => s + i.value * i.weight, 0) / weight).toFixed(1));
}

/** 비율 지표의 증감은 상대 %가 아니라 %p 차이로 본다. */
export function pointTrend(current: number, previous: number | undefined): { direction: "up" | "down" | "flat"; percent: number } {
  if (previous === undefined) return { direction: "flat", percent: 0 };
  const diff = Number((current - previous).toFixed(1));
  return { direction: diff === 0 ? "flat" : diff > 0 ? "up" : "down", percent: Math.abs(diff) };
}
