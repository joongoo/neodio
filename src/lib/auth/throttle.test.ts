import assert from "node:assert/strict";
import test from "node:test";
import { checkThrottle, clientIp, EMAIL_POLICY, EMPTY_STATE, recordFailure, throttleMessage, type ThrottleState } from "./throttle";

const T0 = 1_000_000;
const MIN = 60 * 1000;

test("한도 전에는 막지 않고, 한도에 닿으면 잠근다", () => {
  let state: ThrottleState | undefined;
  for (let i = 0; i < EMAIL_POLICY.maxFailures - 1; i++) {
    state = recordFailure(state, T0 + i * 1000, EMAIL_POLICY);
    assert.equal(checkThrottle(state, T0 + i * 1000).blocked, false);
  }
  state = recordFailure(state, T0 + 10_000, EMAIL_POLICY);
  const check = checkThrottle(state, T0 + 10_000);
  assert.equal(check.blocked, true);
  assert.equal(check.retryAfterSec, 15 * 60);
});

test("잠금은 시간이 지나면 풀린다", () => {
  let state: ThrottleState | undefined;
  for (let i = 0; i < EMAIL_POLICY.maxFailures; i++) state = recordFailure(state, T0, EMAIL_POLICY);
  assert.equal(checkThrottle(state, T0 + 14 * MIN).blocked, true);
  assert.equal(checkThrottle(state, T0 + 16 * MIN).blocked, false);
});

test("윈도우가 지나면 실패 횟수를 처음부터 센다", () => {
  let state = recordFailure(undefined, T0, EMAIL_POLICY);
  for (let i = 0; i < 5; i++) state = recordFailure(state, T0 + i, EMAIL_POLICY);
  assert.equal(state.failCount, 6);
  state = recordFailure(state, T0 + 20 * MIN, EMAIL_POLICY);
  assert.equal(state.failCount, 1);
  assert.equal(checkThrottle(state, T0 + 20 * MIN).blocked, false);
});

test("상태가 없으면 막지 않고, 안내 문구는 분 단위로 올린다", () => {
  assert.equal(checkThrottle(undefined, T0).blocked, false);
  assert.equal(checkThrottle(EMPTY_STATE, T0).blocked, false);
  assert.match(throttleMessage(61), /2분/);
  assert.match(throttleMessage(5), /1분/);
});

test("IP는 x-forwarded-for의 첫 값을 쓴다", () => {
  const h = (map: Record<string, string>) => ({ get: (n: string) => map[n] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(h({})), "unknown");
});
