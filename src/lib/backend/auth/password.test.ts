import assert from "node:assert/strict";
import test from "node:test";
import { generateTempPassword, hashPassword, passwordProblem, verifyPassword } from "./password";

test("해시는 같은 비밀번호도 매번 다르고 검증은 통과한다", async () => {
  const a = await hashPassword("correct horse battery");
  const b = await hashPassword("correct horse battery");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("scrypt$"));
  assert.equal(await verifyPassword("correct horse battery", a), true);
  assert.equal(await verifyPassword("wrong password", a), false);
});

test("깨진 해시 문자열은 검증 실패", async () => {
  assert.equal(await verifyPassword("x", "plaintext"), false);
  assert.equal(await verifyPassword("x", "scrypt$1$2$3"), false);
});

test("비밀번호 규칙", () => {
  assert.match(passwordProblem("short")!, /8자/);
  assert.match(passwordProblem("user@example.com", "USER@example.com")!, /이메일/);
  assert.equal(passwordProblem("a-long-enough-password", "user@example.com"), null);
});

test("임시 비밀번호는 12자이고 매번 다르다", () => {
  const a = generateTempPassword();
  assert.equal(a.length, 12);
  assert.notEqual(a, generateTempPassword());
  assert.match(a, /^[a-zA-Z2-9]+$/);
});
