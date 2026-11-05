import test from "node:test";
import assert from "node:assert/strict";
import { retryTransient, type AttemptOutcome } from "./collectRetry";

const fail = (retryable: boolean): AttemptOutcome => ({ ok: false, retryable });
const noSleep = async () => {};

test("일시 오류는 다시 시도해 복구된다", async () => {
  const calls: number[] = [];
  const r = await retryTransient([1, 3], async (i) => { calls.push(i); return { ok: true }; }, { sleep: noSleep });
  assert.deepEqual(r.recovered, [1, 3]);
  assert.deepEqual(r.remaining, []);
  assert.deepEqual(calls, [1, 3]);
});

test("여전히 실패하면 다음 라운드에서 다시 시도하고, 라운드 수를 넘으면 남긴다", async () => {
  const attempts = new Map<number, number>();
  const r = await retryTransient([0, 1], async (i) => {
    const n = (attempts.get(i) ?? 0) + 1;
    attempts.set(i, n);
    if (i === 0) return n >= 2 ? { ok: true } : fail(true); // 2번째 시도에 성공
    return fail(true); // 계속 실패
  }, { passes: 2, sleep: noSleep });
  assert.deepEqual(r.recovered, [0]);
  assert.deepEqual(r.remaining, [1]);
  assert.equal(attempts.get(1), 2);
});

test("영구 오류는 더 시도하지 않는다", async () => {
  let calls = 0;
  const r = await retryTransient([5], async () => { calls++; return fail(false); }, { sleep: noSleep });
  assert.equal(calls, 1);
  assert.deepEqual(r.remaining, [5]);
  assert.deepEqual(r.recovered, []);
});

test("라운드마다 기다리는 시간이 늘어난다", async () => {
  const waits: number[] = [];
  await retryTransient([0], async () => fail(true), { passes: 3, delayMs: 1000, sleep: async (ms) => { waits.push(ms); } });
  assert.deepEqual(waits, [1000, 2000, 3000]);
});

test("중단 신호가 오면 남은 항목을 시도하지 않고 남긴다", async () => {
  let stop = false;
  let calls = 0;
  const r = await retryTransient([0, 1, 2], async () => { calls++; stop = true; return { ok: true }; }, { sleep: noSleep, shouldStop: () => stop });
  assert.equal(calls, 1);
  assert.deepEqual(r.recovered, [0]);
  assert.deepEqual(r.remaining, [1, 2]);
});

test("실패 항목이 없으면 기다리지 않는다", async () => {
  let slept = false;
  const r = await retryTransient([], async () => ({ ok: true }), { sleep: async () => { slept = true; } });
  assert.equal(slept, false);
  assert.deepEqual(r, { recovered: [], remaining: [] });
});

test("콜백: 라운드 시작과 시도 결과를 알린다", async () => {
  const log: string[] = [];
  await retryTransient([2], async () => ({ ok: true }), {
    sleep: noSleep,
    onPass: (pass, rem, wait) => log.push(`pass${pass}:${rem.join(",")}:${wait}`),
    onAttempt: (i, o, pass) => log.push(`try${i}:${o.ok}:${pass}`),
  });
  assert.deepEqual(log, ["pass1:2:8000", "try2:true:1"]);
});
