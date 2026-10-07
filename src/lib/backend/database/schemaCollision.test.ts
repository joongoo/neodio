import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { getPromptStore } from "./index";
import { createUser, verifyLogin } from "../auth/authStore";

// 운영 DB는 다른 앱과 공유돼 users·sessions 같은 이름이 이미 다른 구조로 쓰이고 있다. 새 테이블이 그 이름과 겹치면
// 스키마 초기화 전체가 롤백돼 모든 화면이 오류가 나므로, 낯선 구조의 테이블이 먼저 있어도 초기화와 로그인 기능이 동작해야 한다.
test("다른 앱의 users·sessions 테이블이 있어도 스키마 초기화와 회원 기능이 동작한다", async () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING });
  await pool.query("CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, phone_e164 TEXT, display_name TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS sessions (id UUID PRIMARY KEY, user_id UUID, access_token_hash TEXT)");
  await pool.query("CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY, detail TEXT)");
  await pool.end();

  const store = await getPromptStore(); // 이 시점에 스키마 초기화가 낯선 테이블과 함께 실행된다
  const [{ n }] = await store.query<{ n: number }>("SELECT count(*)::int AS n FROM neodio_users");
  assert.equal(n >= 0, true);
  const email = `collision-${Date.now()}@example.test`;
  await createUser({ email, name: "충돌 확인", password: "collision-password-1" });
  assert.equal((await verifyLogin(email, "collision-password-1"))?.email, email);
  await store.query("DELETE FROM neodio_users WHERE lower(email)=$1", [email]);
});

// 이메일을 아직 쓰지 않아 로그인 키는 아이디다 — 이메일 형식이 아니어도 가입되고, 대소문자는 구분하지 않으며, 규칙에 맞지 않으면 거절한다.
test("로그인 아이디: 이메일 형식 없이 가입·로그인되고 형식이 틀리거나 중복이면 거절한다", async () => {
  const store = await getPromptStore();
  const id = `id-test-${Date.now()}`;
  await createUser({ email: id, name: "아이디 확인", password: "id-test-password-1" });
  assert.equal((await verifyLogin(id.toUpperCase(), "id-test-password-1"))?.email, id);
  await assert.rejects(createUser({ email: id.toUpperCase(), name: "중복", password: "id-test-password-1" }), /이미 사용 중인 아이디/);
  for (const bad of ["ab", "한글아이디", "has space", "-start", "x".repeat(51)]) {
    await assert.rejects(createUser({ email: bad, name: "형식", password: "id-test-password-1" }), /아이디는/, bad);
  }
  await store.query("DELETE FROM neodio_users WHERE lower(email)=$1", [id]);
});
