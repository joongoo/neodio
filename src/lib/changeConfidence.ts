// 변화 신뢰도 표시 (D2) — 순수 함수. 저장하지 않고 읽기 시점에 계산한다.
// 설계: docs/oss-research/01-geo-aeo-tracker/05_INDEPENDENT_DESIGN.md D2.
// 두 기간의 비율(언급 수 / 전체 실행 수)을 비교해 변화가 표본 크기에 비해 의미 있는지 라벨로 알려 준다.
//  - 구간: 두 비율의 Wilson 구간을 합성한 Newcombe 방법(소표본·0%/100% 근처에서도 안정).
//  - 라벨: 표본 부족 / 노이즈 가능 / 유의.

export type ConfidenceLabel = "insufficient" | "noise" | "significant";

export interface PeriodCount {
  /** 성공 수(예: 가중 언급 수). 소수 허용 */
  hits: number;
  /** 전체 수(예: 가중 전체 실행 수). 소수 허용 */
  total: number;
}

export interface ConfidenceOptions {
  /** 기간마다 필요한 최소 표본. 기본 20 */
  minSample?: number;
  /** 양측 z 값. 기본 1.96(95%) */
  z?: number;
}

export interface ChangeConfidence {
  label: ConfidenceLabel;
  /** 현재 − 이전, %p. 표본 부족이어도 계산은 하지만 화면에서 크게 보이지 않는다 */
  diffPoints: number;
  /** 차이의 신뢰구간, %p */
  ci: { low: number; high: number };
  previous: { rate: number; n: number };
  current: { rate: number; n: number };
  /** 변화율(상대 %)을 숫자로 크게 보여도 되는가. 표본 부족이거나 이전 값이 0이면 false */
  showPercent: boolean;
  /** 한 줄 설명(리포트 문구용) */
  note: string;
}

export const DEFAULT_MIN_SAMPLE = 20;
export const DEFAULT_Z = 1.96;

export function wilsonInterval(hits: number, total: number, z = DEFAULT_Z): { low: number; high: number; rate: number } {
  if (!(total > 0)) return { low: 0, high: 1, rate: 0 };
  const p = Math.min(1, Math.max(0, hits / total));
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), rate: p };
}

const pct = (x: number) => Math.round(x * 1000) / 10; // 소수 한 자리 %

export function changeConfidence(previous: PeriodCount, current: PeriodCount, options: ConfidenceOptions = {}): ChangeConfidence {
  const minSample = options.minSample ?? DEFAULT_MIN_SAMPLE;
  const z = options.z ?? DEFAULT_Z;
  const a = wilsonInterval(previous.hits, previous.total, z);
  const b = wilsonInterval(current.hits, current.total, z);
  const diff = b.rate - a.rate;
  // Newcombe(1998) 방법 10: 차이 p2 − p1의 구간
  const low = diff - Math.sqrt((b.rate - b.low) ** 2 + (a.high - a.rate) ** 2);
  const high = diff + Math.sqrt((b.high - b.rate) ** 2 + (a.rate - a.low) ** 2);

  const enough = previous.total >= minSample && current.total >= minSample;
  const label: ConfidenceLabel = !enough ? "insufficient" : low > 0 || high < 0 ? "significant" : "noise";
  const ci = { low: pct(low), high: pct(high) };
  const diffPoints = pct(diff);
  const showPercent = enough && previous.hits > 0;
  const range = `${ci.low >= 0 ? "+" : ""}${ci.low}~${ci.high >= 0 ? "+" : ""}${ci.high}%p`;
  const note =
    label === "insufficient"
      ? `표본이 적어(이전 ${Math.round(previous.total)}건, 이번 ${Math.round(current.total)}건) 변화를 판단하기 어려워요. 기간당 ${minSample}건 이상부터 비교해요.`
      : label === "noise"
        ? `${diffPoints > 0 ? "+" : ""}${diffPoints}%p 변했지만 표본 크기로 보면 우연일 수 있어요(95% 구간 ${range}).`
        : `${diffPoints > 0 ? "+" : ""}${diffPoints}%p ${diffPoints > 0 ? "올랐어요" : "내렸어요"}. 표본 크기를 감안해도 의미 있는 변화예요(95% 구간 ${range}).`;
  return {
    label,
    diffPoints,
    ci,
    previous: { rate: pct(a.rate), n: previous.total },
    current: { rate: pct(b.rate), n: current.total },
    showPercent,
    note,
  };
}

/** 연속된 주 배열(오래된 순)에서 각 주를 직전 주와 비교한다. 첫 주는 null. */
export function weeklyConfidence(weeks: PeriodCount[], options?: ConfidenceOptions): Array<ChangeConfidence | null> {
  return weeks.map((w, i) => (i === 0 ? null : changeConfidence(weeks[i - 1], w, options)));
}
