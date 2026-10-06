import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedForReadOnly } from "./readOnly";

test("조회(GET)와 인증 요청은 막지 않는다", () => {
  assert.equal(isBlockedForReadOnly("GET", "/api/organizations"), false);
  assert.equal(isBlockedForReadOnly(undefined, "/api/change-log"), false);
  assert.equal(isBlockedForReadOnly("POST", "/api/auth/change-password"), false);
  assert.equal(isBlockedForReadOnly("POST", "/api/auth/logout"), false);
});

test("상태를 바꾸는 쓰기 요청은 막는다", () => {
  assert.equal(isBlockedForReadOnly("POST", "/api/tracked-topics"), true);
  assert.equal(isBlockedForReadOnly("PATCH", "/api/brands-management/brands/b1"), true);
  assert.equal(isBlockedForReadOnly("DELETE", "/api/registered-urls?x=1"), true);
  assert.equal(isBlockedForReadOnly("post", "https://app.example.com/api/categories"), true);
});

test("조회용 POST는 허용한다", () => {
  assert.equal(isBlockedForReadOnly("POST", "/api/naver-datalab"), false);
  assert.equal(isBlockedForReadOnly("POST", "/api/gsc-url-inspection"), false);
  assert.equal(isBlockedForReadOnly("POST", "/api/pagespeed-insights"), false);
});

test("API가 아닌 주소는 대상이 아니다", () => {
  assert.equal(isBlockedForReadOnly("POST", "/some/page"), false);
});
