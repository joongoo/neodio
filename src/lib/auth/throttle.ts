// 로그인·가입 시도 제한(순수 함수) — 무차별 대입 방지. 저장은 DB(서버리스에서는 메모리가 공유되지 않는다).
//
// 실패가 윈도우(기본 15분) 안에 한도를 넘으면 그 키를 잠근다. 키는 이메일(그 계정을 겨눈 시도)과 IP(여러 계정을 훑는 시도)로
// 따로 센다. 이메일 잠금은 남이 내 계정을 잠가 버릴 수 있다는 단점이 있어 한도를 넉넉히(8회) 두고, 잠금은 짧게(15분) 둔다.

export interface ThrottleState {
  failCount: number;
  /** 현재 윈도우가 시작된 시각(ms). */
  windowStart: number;
  /** 잠금이 풀리는 시각(ms). 0이면 잠겨 있지 않다. */
  lockedUntil: number;
}

export interface ThrottlePolicy {
  maxFailures: number;
  windowMs: number;
  lockMs: number;
}

const MINUTE = 60 * 1000;
export const EMAIL_POLICY: ThrottlePolicy = { maxFailures: 8, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
export const IP_POLICY: ThrottlePolicy = { maxFailures: 30, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE };
/** 가입은 한 IP에서 시간당 몇 건까지 — 계정 대량 생성 방지(실패가 아니라 시도 자체를 센다). */
export const SIGNUP_POLICY: ThrottlePolicy = { maxFailures: 10, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE };

export const EMPTY_STATE: ThrottleState = { failCount: 0, windowStart: 0, lockedUntil: 0 };

/** 지금 막혀 있는가 — 막혔다면 몇 초 뒤에 다시 시도할 수 있는지. */
export function checkThrottle(state: ThrottleState | undefined, now: number): { blocked: boolean; retryAfterSec: number } {
  if (state && state.lockedUntil > now) return { blocked: true, retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000) };
  return { blocked: false, retryAfterSec: 0 };
}

/** 실패(또는 시도)를 한 번 기록한 새 상태 — 윈도우가 지났으면 처음부터 다시 센다. */
export function recordFailure(state: ThrottleState | undefined, now: number, policy: ThrottlePolicy): ThrottleState {
  const fresh = !state || now - state.windowStart > policy.windowMs;
  const failCount = (fresh ? 0 : state!.failCount) + 1;
  const windowStart = fresh ? now : state!.windowStart;
  return { failCount, windowStart, lockedUntil: failCount >= policy.maxFailures ? now + policy.lockMs : 0 };
}

/** 사용자에게 보일 안내 — 몇 분 뒤인지만 알려주고 어느 키가 막혔는지는 알려주지 않는다. */
export function throttleMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `시도가 너무 많아요. ${minutes}분 뒤에 다시 시도해주세요.`;
}

/** 요청에서 클라이언트 IP — 프록시가 붙이는 x-forwarded-for의 첫 값(Vercel은 이 값을 직접 채운다). 없으면 "unknown". */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
