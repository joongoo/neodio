import { getPromptStore } from "../database";
import { checkThrottle, recordFailure, type ThrottlePolicy, type ThrottleState } from "@/lib/auth/throttle";

// 시도 제한 저장소 — 키별 상태를 읽고 쓴다. 서버 전용.

async function readState(key: string): Promise<ThrottleState | undefined> {
  const [row] = await (await getPromptStore()).query<{ fail_count: number; window_start: string; locked_until: string }>(
    "SELECT fail_count,window_start,locked_until FROM neodio_auth_throttle WHERE key=$1", [key]);
  return row ? { failCount: row.fail_count, windowStart: Number(row.window_start), lockedUntil: Number(row.locked_until) } : undefined;
}

/** 이 키들 중 하나라도 잠겨 있으면 가장 오래 남은 대기 시간을 돌려준다. */
export async function checkAllowed(keys: string[]): Promise<{ blocked: boolean; retryAfterSec: number }> {
  const now = Date.now();
  let retryAfterSec = 0;
  for (const key of keys) {
    const check = checkThrottle(await readState(key), now);
    if (check.blocked) retryAfterSec = Math.max(retryAfterSec, check.retryAfterSec);
  }
  return { blocked: retryAfterSec > 0, retryAfterSec };
}

export async function registerFailure(key: string, policy: ThrottlePolicy): Promise<void> {
  const store = await getPromptStore();
  const now = Date.now();
  const next = recordFailure(await readState(key), now, policy);
  await store.query(
    `INSERT INTO neodio_auth_throttle(key,fail_count,window_start,locked_until,updated_at) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(key) DO UPDATE SET fail_count=excluded.fail_count,window_start=excluded.window_start,locked_until=excluded.locked_until,updated_at=excluded.updated_at`,
    [key, next.failCount, next.windowStart, next.lockedUntil, new Date(now).toISOString()]);
  // 오래된 기록은 가끔 정리한다(윈도우가 한참 지난 키).
  if (Math.random() < 0.02) await store.query("DELETE FROM neodio_auth_throttle WHERE updated_at < $1", [new Date(now - 24 * 60 * 60 * 1000).toISOString()]);
}

export async function clearFailures(key: string): Promise<void> {
  await (await getPromptStore()).query("DELETE FROM neodio_auth_throttle WHERE key=$1", [key]);
}
