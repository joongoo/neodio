import test from "node:test";
import assert from "node:assert/strict";
import { PrefixSet, parseIp, parsePrefix, prefixContains } from "./cidr";

const ip = (s: string) => {
  const p = parseIp(s);
  assert.ok(p, `해석되어야 함: ${s}`);
  return p;
};
const prefix = (s: string) => {
  const p = parsePrefix(s);
  assert.ok(p, `해석되어야 함: ${s}`);
  return p;
};

test("IPv4 파싱은 엄격하다", () => {
  assert.deepEqual(parseIp("1.2.3.4"), { family: 4, value: 16909060 });
  assert.deepEqual(parseIp("  1.2.3.4  "), { family: 4, value: 16909060 });
  for (const bad of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.2.3.-1", "01.2.3.4", "1.2.3.04", "1.2.3.4a", "a.b.c.d", "0x7f.0.0.1"]) {
    assert.equal(parseIp(bad), null, `거부되어야 함: ${bad}`);
  }
});

test("포트·대괄호·존 ID를 걷어낸다", () => {
  assert.deepEqual(parseIp("1.2.3.4:8080"), parseIp("1.2.3.4"));
  assert.deepEqual(parseIp("[2001:db8::1]"), parseIp("2001:db8::1"));
  assert.deepEqual(parseIp("fe80::1%eth0"), parseIp("fe80::1"));
});

test("IPv6 압축 표기와 오류", () => {
  const a = ip("2001:db8::1");
  assert.equal(a.family, 6);
  if (a.family === 6) {
    assert.equal(a.bytes[0], 0x20);
    assert.equal(a.bytes[1], 0x01);
    assert.equal(a.bytes[2], 0x0d);
    assert.equal(a.bytes[3], 0xb8);
    assert.equal(a.bytes[15], 1);
  }
  assert.deepEqual(parseIp("2001:0db8:0000:0000:0000:0000:0000:0001"), parseIp("2001:db8::1"));
  assert.ok(parseIp("::1"));
  assert.ok(parseIp("::"));
  for (const bad of ["1::2::3", "12345::", "g::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "::1.2.3", ":::"]) {
    assert.equal(parseIp(bad), null, `거부되어야 함: ${bad}`);
  }
});

test("IPv4-mapped IPv6는 IPv4로 변환된다", () => {
  assert.deepEqual(parseIp("::ffff:1.2.3.4"), parseIp("1.2.3.4"));
  assert.deepEqual(parseIp("::ffff:0102:0304"), parseIp("1.2.3.4"));
  // 매핑 접두가 아니면 IPv6로 남는다
  assert.equal(ip("::1:2.3.4.5").family, 6);
});

test("IPv4 접두사 포함 여부", () => {
  const p = prefix("132.196.86.0/24");
  assert.equal(prefixContains(p, ip("132.196.86.0")), true);
  assert.equal(prefixContains(p, ip("132.196.86.255")), true);
  assert.equal(prefixContains(p, ip("132.196.87.0")), false);
  assert.equal(prefixContains(p, ip("132.196.85.255")), false);
});

test("접두사의 호스트 비트는 마스킹되고 경계 길이를 처리한다", () => {
  // 호스트 비트가 섞여 있어도 같은 네트워크로 본다
  assert.equal(prefixContains(prefix("132.196.86.77/24"), ip("132.196.86.1")), true);
  assert.equal(prefixContains(prefix("10.0.0.1/32"), ip("10.0.0.1")), true);
  assert.equal(prefixContains(prefix("10.0.0.1/32"), ip("10.0.0.2")), false);
  assert.equal(prefixContains(prefix("0.0.0.0/0"), ip("203.0.113.9")), true);
  assert.equal(prefixContains(prefix("172.182.202.0/25"), ip("172.182.202.127")), true);
  assert.equal(prefixContains(prefix("172.182.202.0/25"), ip("172.182.202.128")), false);
  assert.equal(prefixContains(prefix("216.73.216.0/22"), ip("216.73.219.255")), true);
  assert.equal(prefixContains(prefix("216.73.216.0/22"), ip("216.73.220.0")), false);
});

test("IPv6 접두사 포함 여부(바이트 경계가 아닌 길이 포함)", () => {
  const p = prefix("2001:4860:4801:10::/64");
  assert.equal(prefixContains(p, ip("2001:4860:4801:10::abcd")), true);
  assert.equal(prefixContains(p, ip("2001:4860:4801:11::1")), false);
  const odd = prefix("2001:db8:ff00::/40"); // 40비트: 5바이트 경계
  assert.equal(prefixContains(odd, ip("2001:db8:ff12::1")), true);
  const nib = prefix("2001:db8:1000::/36"); // 36비트: 4비트 부분 일치
  assert.equal(prefixContains(nib, ip("2001:db8:1fff::1")), true);
  assert.equal(prefixContains(nib, ip("2001:db8:2000::1")), false);
});

test("주소 종류가 다르면 포함되지 않는다", () => {
  assert.equal(prefixContains(prefix("132.196.86.0/24"), ip("2001:db8::1")), false);
  assert.equal(prefixContains(prefix("2001:db8::/32"), ip("132.196.86.1")), false);
});

test("잘못된 접두사는 null", () => {
  for (const bad of ["1.2.3.4/33", "1.2.3.4/", "1.2.3.4/-1", "abc/24", "2001:db8::/129", "1.2.3.4/x", ""]) {
    assert.equal(parsePrefix(bad), null, `거부되어야 함: ${bad}`);
  }
  // 길이가 없으면 단일 주소
  assert.equal(prefix("1.2.3.4").length, 32);
  assert.equal(prefix("2001:db8::1").length, 128);
});

test("PrefixSet은 종류별로 담고 포함 여부를 답한다", () => {
  const set = new PrefixSet();
  set.add(prefix("132.196.86.0/24"));
  set.add(prefix("2001:4860:4801:10::/64"));
  assert.deepEqual(set.counts, { v4: 1, v6: 1 });
  assert.equal(set.size, 2);
  assert.equal(set.contains(ip("132.196.86.9")), true);
  assert.equal(set.contains(ip("2001:4860:4801:10::5")), true);
  assert.equal(set.contains(ip("8.8.8.8")), false);
});
