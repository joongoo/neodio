import assert from "node:assert/strict";
import test from "node:test";
import { createRequestDetailPoller, hasActiveRequestTasks, REQUEST_DETAIL_POLL_MS, type RequestRefreshState } from "./requestDetailProgress";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";

function timers() {
  let sequence = 0;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  return {
    pending,
    schedule(fn: () => void, ms: number) { const id = ++sequence; pending.set(id, { fn, ms }); return id as unknown as ReturnType<typeof setTimeout>; },
    unschedule(id: ReturnType<typeof setTimeout>) { pending.delete(id as unknown as number); },
    fire(ms: number) { const entry = [...pending].find(([, value]) => value.ms === ms); assert.ok(entry, `timer ${ms} exists`); pending.delete(entry[0]); entry[1].fn(); },
  };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("mixed attention requests keep polling while any waiting/running items remain", () => {
  const request = { status: "needs_attention", counts: { waiting: 1, running: 0 } } as RequestLogRow;
  assert.ok(hasActiveRequestTasks(request));
  assert.equal(hasActiveRequestTasks({ ...request, counts: { ...request.counts, waiting: 0 } }), false);
});

test("polling reads after five seconds without overlap and stops at completion", async () => {
  const clock = timers(); let reads = 0, updates = 0;
  let resolve!: (value: boolean) => void;
  const poller = createRequestDetailPoller({ ...clock, initiallyActive: true, initiallyVisible: true,
    read: async () => { reads++; return new Promise<boolean>(done => { resolve = done; }); },
    onData: () => updates++, onError: () => assert.fail("unexpected error"), isActive: value => value });
  assert.equal(reads, 0);
  clock.fire(REQUEST_DETAIL_POLL_MS);
  assert.equal(reads, 1);
  assert.equal([...clock.pending.values()].filter(timer => timer.ms === REQUEST_DETAIL_POLL_MS).length, 0);
  resolve(false); await flush();
  assert.equal(updates, 1); assert.equal(clock.pending.size, 0);
  poller.setVisible(false); poller.setVisible(true); assert.equal(reads, 1);
  poller.dispose();
});

test("hidden tabs and disposal abort requests and ignore late responses", async () => {
  const clock = timers(); let signal!: AbortSignal, resolve!: (value: boolean) => void, updates = 0;
  const poller = createRequestDetailPoller({ ...clock, initiallyActive: true, initiallyVisible: false,
    read: async input => { signal = input; return new Promise<boolean>(done => { resolve = done; }); },
    onData: () => updates++, onError: () => assert.fail("hidden error"), isActive: value => value });
  assert.equal(clock.pending.size, 0);
  poller.setVisible(true); assert.ok(signal);
  poller.setVisible(false); assert.ok(signal.aborted);
  resolve(true); await flush(); assert.equal(updates, 0); assert.equal(clock.pending.size, 0);
  poller.setVisible(true); poller.dispose(); assert.ok(signal.aborted);
  resolve(true); await flush(); assert.equal(updates, 0); assert.equal(clock.pending.size, 0);
});

test("transient errors retry only the DB read; fatal errors stop polling", async () => {
  const clock = timers(); let fatal = false, reads = 0, errors = 0;
  const poller = createRequestDetailPoller({ ...clock, initiallyActive: true, initiallyVisible: true,
    read: async () => { reads++; throw new Error("read failed"); }, onData: () => assert.fail("unexpected data"),
    onError: () => errors++, isActive: () => true, isFatal: () => fatal });
  clock.fire(REQUEST_DETAIL_POLL_MS); await flush(); assert.equal(errors, 1);
  fatal = true; clock.fire(REQUEST_DETAIL_POLL_MS); await flush();
  assert.equal(reads, 2); assert.equal(errors, 2); assert.equal(clock.pending.size, 0);
  poller.dispose();
});

test("completed requests never start a polling timer", () => {
  const clock = timers();
  const poller = createRequestDetailPoller({ ...clock, initiallyActive: false, initiallyVisible: true,
    read: async () => assert.fail("no read"), onData: () => {}, onError: () => {}, isActive: () => false });
  assert.equal(clock.pending.size, 0); poller.dispose();
});

test("a slow read times out and schedules another read without changing task state", async () => {
  const clock = timers(); let errors = 0;
  const poller = createRequestDetailPoller<boolean>({ ...clock, initiallyActive: true, initiallyVisible: true,
    read: signal => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })),
    onData: () => assert.fail("no result"), onError: () => errors++, isActive: value => value });
  clock.fire(REQUEST_DETAIL_POLL_MS); clock.fire(15_000); await flush();
  assert.equal(errors, 1);
  assert.equal([...clock.pending.values()].filter(timer => timer.ms === REQUEST_DETAIL_POLL_MS).length, 1);
  poller.dispose(); assert.equal(clock.pending.size, 0);
});

test("visual countdown follows the actual schedule without additional reads", async () => {
  const clock = timers(); let currentTime = 100_000, reads = 0, remainsActive = true;
  const states: RequestRefreshState[] = [];
  const poller = createRequestDetailPoller({ ...clock, now: () => currentTime, onStateChange: state => states.push(state),
    initiallyActive: true, initiallyVisible: true, read: async () => { reads++; return remainsActive; }, onData: () => {}, onError: () => assert.fail("unexpected error"), isActive: value => value });
  assert.deepEqual(states.at(-1), { phase: "waiting", secondsUntilRefresh: 5, nextRefreshAt: 105_000, lastUpdatedAt: null });
  currentTime += 1000; clock.fire(1000); assert.equal(states.at(-1)?.secondsUntilRefresh, 4);
  currentTime += 1000; clock.fire(1000); assert.equal(states.at(-1)?.secondsUntilRefresh, 3);
  assert.equal(reads, 0, "countdown is client-only");
  currentTime = 105_000; clock.fire(REQUEST_DETAIL_POLL_MS);
  assert.equal(states.at(-1)?.phase, "refreshing");
  await flush();
  assert.deepEqual(states.at(-1), { phase: "waiting", secondsUntilRefresh: 5, nextRefreshAt: 110_000, lastUpdatedAt: 105_000 });
  remainsActive = false; currentTime = 110_000; clock.fire(REQUEST_DETAIL_POLL_MS); await flush();
  assert.deepEqual(states.at(-1), { phase: "stopped", secondsUntilRefresh: null, nextRefreshAt: null, lastUpdatedAt: 110_000 });
  assert.equal(reads, 2); assert.equal(clock.pending.size, 0); poller.dispose();
});

test("visual feedback pauses on hidden tabs and ignores updates after disposal", async () => {
  const clock = timers(), states: RequestRefreshState[] = [];
  const poller = createRequestDetailPoller({ ...clock, initiallyActive: true, initiallyVisible: false,
    onStateChange: state => states.push(state), read: async () => true, onData: () => {}, onError: () => {}, isActive: value => value });
  assert.equal(states.at(-1)?.phase, "paused"); assert.equal(clock.pending.size, 0);
  poller.setVisible(true); assert.equal(states.at(-1)?.phase, "refreshing"); await flush();
  assert.equal(states.at(-1)?.phase, "waiting");
  poller.setVisible(false); assert.equal(states.at(-1)?.phase, "paused"); assert.equal(clock.pending.size, 0);
  poller.dispose(); const count = states.length; poller.setVisible(true); await flush(); assert.equal(states.length, count);
});

test("CSR filter changes read once immediately even for finished requests", async () => {
  const clock = timers(); let reads = 0;
  const poller = createRequestDetailPoller({ ...clock, immediate: true, initiallyActive: false, initiallyVisible: true,
    read: async () => { reads++; return false; }, onData: () => {}, onError: () => assert.fail("unexpected error"), isActive: value => value });
  assert.equal(reads, 1); await flush(); assert.equal(clock.pending.size, 0);
  poller.dispose();
});

test("hidden CSR queries wait for visibility before their one-time read", async () => {
  const clock = timers(); let reads = 0;
  const poller = createRequestDetailPoller({ ...clock, immediate: true, initiallyActive: false, initiallyVisible: false,
    read: async () => { reads++; return false; }, onData: () => {}, onError: () => {}, isActive: value => value });
  assert.equal(reads, 0); assert.equal(clock.pending.size, 0);
  poller.setVisible(true); assert.equal(reads, 1); await flush();
  assert.equal(clock.pending.size, 0); poller.dispose();
});
