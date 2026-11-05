import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_IP_TRUST_OPTIONS, IpTrustAccumulator } from "./ipTrust";

function feed(acc: IpTrustAccumulator, rows: Array<[string | undefined, string]>) {
  for (const [ip, ua] of rows) acc.add(ip, ua);
}

test("IP 열이 없으면 no-ip", () => {
  const acc = new IpTrustAccumulator();
  feed(acc, [[undefined, "UA"], [undefined, "UA"]]);
  assert.equal(acc.report().status, "no-ip");
  assert.equal(new IpTrustAccumulator().report().status, "no-ip");
});

test("표본이 작으면 판단을 보류한다", () => {
  const acc = new IpTrustAccumulator();
  for (let i = 0; i < DEFAULT_IP_TRUST_OPTIONS.minSample - 1; i++) acc.add("10.0.0.1", `UA-${i}`);
  assert.equal(acc.report().status, "insufficient-sample");
});

test("프록시 뒤 서버 로그: 소수 IP에 다양한 UA가 몰리면 의심", () => {
  const acc = new IpTrustAccumulator();
  for (let i = 0; i < 1000; i++) acc.add(i % 2 === 0 ? "172.16.0.1" : "172.16.0.2", `Browser-${i % 40}`);
  const r = acc.report();
  assert.equal(r.status, "suspected-proxy");
  assert.ok(r.topShare > 0.9);
  assert.ok(r.distinctUasBehindTop >= 10);
});

test("봇이 트래픽 대부분인 작은 사이트는 UA가 다양하지 않으므로 오탐하지 않는다", () => {
  const acc = new IpTrustAccumulator();
  // 상위 3개 IP가 90%를 차지하지만 각각 단일 봇 UA
  for (let i = 0; i < 900; i++) acc.add(`132.196.86.${i % 3}`, "GPTBot/1.1");
  for (let i = 0; i < 100; i++) acc.add(`203.0.113.${i % 50}`, `Browser-${i % 5}`);
  const r = acc.report();
  assert.equal(r.status, "trusted");
  assert.ok(r.topShare > 0.5);
  assert.ok(r.distinctUasBehindTop < 10);
});

test("다양한 IP에 분산된 일반 로그는 신뢰", () => {
  const acc = new IpTrustAccumulator();
  for (let i = 0; i < 500; i++) acc.add(`203.0.113.${i % 250}`, `Browser-${i % 30}`);
  assert.equal(acc.report().status, "trusted");
});

test("추적 IP 상한을 넘으면 새 IP는 추적하지 않아 메모리가 묶인다", () => {
  const acc = new IpTrustAccumulator({ ...DEFAULT_IP_TRUST_OPTIONS, maxTrackedIps: 5, minSample: 1 });
  for (let i = 0; i < 100; i++) acc.add(`10.0.0.${i}`, "UA");
  const r = acc.report();
  assert.equal(r.total, 100);
  assert.equal(r.withIp, 100);
  // 상위 3개가 각 1건 = 3/100, 의심 아님
  assert.equal(r.status, "trusted");
});
