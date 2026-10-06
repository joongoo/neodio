// "같은 주에 같은 프롬프트·엔진·마켓으로 여러 번 수집한 실행"은 서로 다른 질문이 아니라 같은 질문의
// 표본이다. 실행마다 1로 세면 반복을 많이 한 질의가 지표에서 더 큰 비중을 차지하므로, 그런 묶음을
// 관측 1건으로 보고 실행마다 1/(묶음 안 실행 수)의 가중치를 준다. 묶음 안 언급 비율이 그 관측의 값이 된다.
// 원본 실행 기록은 건드리지 않고 계산할 때만 쓴다.

export interface ObservationRun {
  id: string;
  promptId: string;
  llmModelId: string;
  marketId: string;
  /** 실행이 속한 주(일요일 시작) — 묶는 단위. */
  week: string;
}

export function observationKey(run: Omit<ObservationRun, "id">): string {
  return `${run.promptId}|${run.llmModelId}|${run.marketId}|${run.week}`;
}

/** 실행 id → 가중치(그 묶음 안 실행 수의 역수). 묶음의 가중치 합은 언제나 1. */
export function observationWeights(runs: ObservationRun[]): Map<string, number> {
  const sizeByKey = new Map<string, number>();
  for (const run of runs) sizeByKey.set(observationKey(run), (sizeByKey.get(observationKey(run)) ?? 0) + 1);
  return new Map(runs.map((run) => [run.id, 1 / (sizeByKey.get(observationKey(run)) ?? 1)]));
}

/** 가중치 합 — 가중치가 없는 실행은 1로 센다. */
export function sumWeights(ids: Iterable<string>, weights: Map<string, number>): number {
  let total = 0;
  for (const id of ids) total += weights.get(id) ?? 1;
  return total;
}

/** 표시용 — 정수면 그대로, 아니면 소수 한 자리. */
export function formatObservationCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
