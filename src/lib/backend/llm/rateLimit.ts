// 유료 LLM API를 부르는 화면 버튼들의 조직별 분당 호출 제한 — 서버 인스턴스별 메모리 기준의 최소 방어.
const WINDOW_MS = 60_000;
const recentCalls = new Map<string, number[]>();

/** 제한을 넘었으면 true(호출 기록은 남기지 않는다). 넘지 않으면 이번 호출을 기록하고 false. */
export function overLlmLimit(key: string, maxPerWindow = 10, now = Date.now()): boolean {
  const calls = (recentCalls.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (calls.length >= maxPerWindow) {
    recentCalls.set(key, calls);
    return true;
  }
  calls.push(now);
  recentCalls.set(key, calls);
  return false;
}
