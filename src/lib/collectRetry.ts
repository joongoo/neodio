// 수집 중 일시 오류(제공사 과부하 503, 한도 429 등)로 실패한 항목을 잠시 뒤 다시 시도하는 순수 헬퍼.
// 서버 함수는 시간 제한(60초) 때문에 길게 기다릴 수 없어, 기다림은 화면(클라이언트)이 맡는다.

export type AttemptOutcome = { ok: true } | { ok: false; retryable: boolean; error?: string };

export interface RetryOptions {
  /** 재시도 라운드 수. 기본 2 */
  passes?: number;
  /** 라운드마다 기다리는 시간(ms) = delayMs × 라운드 번호. 기본 8000 */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldStop?: () => boolean;
  /** 라운드가 시작되기 전(기다리기 직전) 호출 */
  onPass?: (pass: number, remaining: number[], waitMs: number) => void;
  /** 항목 하나를 시도할 때마다 호출 */
  onAttempt?: (index: number, outcome: AttemptOutcome, pass: number) => void;
}

export interface RetryResult {
  /** 재시도로 성공한 항목 */
  recovered: number[];
  /** 끝내 실패한 항목(영구 오류 포함) */
  remaining: number[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 일시 오류로 실패한 항목(indices)만 골라 다시 시도한다. 영구 오류가 나온 항목은 더 시도하지 않는다. */
export async function retryTransient(indices: number[], attempt: (index: number) => Promise<AttemptOutcome>, options: RetryOptions = {}): Promise<RetryResult> {
  const passes = options.passes ?? 2;
  const delayMs = options.delayMs ?? 8000;
  const sleep = options.sleep ?? defaultSleep;
  const recovered: number[] = [];
  let pending = [...indices];
  const permanent: number[] = [];
  for (let pass = 1; pass <= passes && pending.length > 0; pass++) {
    if (options.shouldStop?.()) break;
    const wait = delayMs * pass;
    options.onPass?.(pass, pending, wait);
    await sleep(wait);
    const next: number[] = [];
    for (const index of pending) {
      if (options.shouldStop?.()) { next.push(index); continue; }
      const outcome = await attempt(index);
      options.onAttempt?.(index, outcome, pass);
      if (outcome.ok) recovered.push(index);
      else if (outcome.retryable) next.push(index);
      else permanent.push(index);
    }
    pending = next;
  }
  return { recovered, remaining: [...pending, ...permanent].sort((a, b) => a - b) };
}
