import test from "node:test";
import assert from "node:assert/strict";
import { parseIp } from "./cidr";
import { parseRangeSnapshot, RangeStore } from "./ranges";
import { FRESH_CREATION, NOW_MS, STALE_CREATION, rangeJson } from "./testing";

test("정상 스냅샷: 확인한 공개 구조({creationTime, prefixes[]})", () => {
  const r = parseRangeSnapshot(rangeJson(["132.196.86.0/24", "2001:4860:4801:10::/64"]), "x", NOW_MS);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.snapshot.counts, { v4: 1, v6: 1 });
    // 시간대 없는 creationTime("…15:45:59.000000")은 UTC로 해석한다
    assert.equal(r.snapshot.creationTimeMs, Date.UTC(2026, 10, 4, 15, 45, 59));
  }
});

test("creationTime이 없어도 받아들이되 null로 기록한다", () => {
  const r = parseRangeSnapshot({ prefixes: [{ ipv4Prefix: "1.2.3.0/24" }] }, "x", NOW_MS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.snapshot.creationTimeMs, null);
});

test("스키마 이탈은 무효: 조용히 받아들이지 않는다", () => {
  const cases: Array<[unknown, string]> = [
    [null, "not-object"],
    [[], "not-object"],
    ["text", "not-object"],
    [{ creationTime: "x" }, "no-prefixes"],
    [{ prefixes: "nope" }, "no-prefixes"],
    [{ prefixes: [] }, "empty"],
    [{ prefixes: [{ cidr: "1.2.3.0/24" }] }, "bad-entry"], // 알 수 없는 키만 있는 항목
    [{ prefixes: [{ ipv4Prefix: "999.2.3.0/24" }] }, "bad-entry"],
    [{ prefixes: [{ ipv4Prefix: "1.2.3.0/40" }] }, "bad-entry"],
    [{ prefixes: [{ ipv4Prefix: "2001:db8::/32" }] }, "bad-entry"], // 키와 내용의 주소 종류가 어긋남
    [{ prefixes: [{ ipv6Prefix: "1.2.3.0/24" }] }, "bad-entry"],
    [{ prefixes: [{ ipv4Prefix: "1.2.3.0/24" }, null] }, "bad-entry"],
  ];
  for (const [input, reason] of cases) {
    const r = parseRangeSnapshot(input, "x", NOW_MS);
    assert.equal(r.ok, false, JSON.stringify(input));
    if (!r.ok) assert.equal(r.reason, reason, JSON.stringify(input));
  }
});

test("항목에 알 수 없는 키가 함께 있어도 유효한 접두사가 있으면 허용", () => {
  const r = parseRangeSnapshot({ prefixes: [{ ipv4Prefix: "1.2.3.0/24", note: "ok" }] }, "x", NOW_MS);
  assert.equal(r.ok, true);
});

test("RangeStore 상태: missing / ok / stale / invalid", () => {
  const store = new RangeStore(14);
  assert.equal(store.state("a", NOW_MS), "missing");

  const fresh = parseRangeSnapshot(rangeJson(["1.2.3.0/24"], FRESH_CREATION), "a", NOW_MS);
  assert.ok(fresh.ok);
  if (fresh.ok) store.setSnapshot(fresh.snapshot);
  assert.equal(store.state("a", NOW_MS), "ok");
  assert.equal(store.contains("a", parseIp("1.2.3.9")!), true);
  assert.equal(store.contains("a", parseIp("8.8.8.8")!), false);
  assert.equal(store.contains("zzz", parseIp("1.2.3.9")!), false);

  // 낡음: 파일이 밝힌 생성 시각이 14일을 넘음
  const stale = parseRangeSnapshot(rangeJson(["1.2.3.0/24"], STALE_CREATION), "b", NOW_MS);
  assert.ok(stale.ok);
  if (stale.ok) store.setSnapshot(stale.snapshot);
  assert.equal(store.state("b", NOW_MS), "stale");
  // 14일 경계: 정확히 14일은 허용, 그보다 오래되면 낡음
  assert.equal(store.state("b", Date.UTC(2026, 9, 15, 0, 0, 0)), "ok");
  assert.equal(store.state("b", Date.UTC(2026, 9, 15, 0, 0, 1)), "stale");

  // 스키마 이탈 기록: 이전 성공 스냅샷이 있어도 격하
  store.setInvalid("a", "bad-entry");
  assert.equal(store.state("a", NOW_MS), "invalid");
  store.setInvalid("c", "bad-entry");
  assert.equal(store.state("c", NOW_MS), "invalid");
  // 다시 성공하면 무효 기록이 지워진다
  if (fresh.ok) store.setSnapshot(fresh.snapshot);
  assert.equal(store.state("a", NOW_MS), "ok");
});

test("일시적 가져오기 실패는 마지막 성공 스냅샷을 낡을 때까지 계속 쓰게 둔다", () => {
  const store = new RangeStore(14);
  const r = parseRangeSnapshot(rangeJson(["1.2.3.0/24"], FRESH_CREATION), "a", NOW_MS);
  assert.ok(r.ok);
  if (r.ok) store.setSnapshot(r.snapshot);

  store.setFetchFailed("a", "HTTP 503", NOW_MS);
  // 상태는 그대로 ok — 일시 장애로 모든 판정이 '스키마 무효'가 되면 안 된다
  assert.equal(store.state("a", NOW_MS), "ok");
  assert.equal(store.contains("a", parseIp("1.2.3.9")!), true);
  assert.deepEqual(store.lastFetchFailure("a"), { reason: "HTTP 503", atMs: NOW_MS });

  // 실패가 계속되어 목록(생성 2026-11-04T15:45:59Z)이 14일을 넘기면 그때 낡음으로 격하
  assert.equal(store.state("a", Date.UTC(2026, 10, 18, 15, 45, 59)), "ok");
  assert.equal(store.state("a", Date.UTC(2026, 10, 18, 15, 46, 0)), "stale");

  // 스냅샷이 한 번도 없던 출처의 실패는 '없음'
  store.setFetchFailed("never", "timeout", NOW_MS);
  assert.equal(store.state("never", NOW_MS), "missing");

  // 가져오기 실패와 스키마 이탈은 별개: 이탈이 기록되면 실패 기록과 무관하게 invalid
  store.setInvalid("a", "bad-entry");
  assert.equal(store.state("a", NOW_MS), "invalid");

  // 다시 성공하면 두 기록 모두 지워진다
  if (r.ok) store.setSnapshot(r.snapshot);
  assert.equal(store.state("a", NOW_MS), "ok");
  assert.equal(store.lastFetchFailure("a"), undefined);
});

test("creationTime이 없으면 받은 시각을 나이의 기준으로 쓴다", () => {
  const store = new RangeStore(14);
  const r = parseRangeSnapshot({ prefixes: [{ ipv4Prefix: "1.2.3.0/24" }] }, "n", Date.UTC(2026, 9, 1));
  assert.ok(r.ok);
  if (r.ok) store.setSnapshot(r.snapshot);
  assert.equal(store.state("n", NOW_MS), "stale");
});
