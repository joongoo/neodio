import assert from "node:assert/strict";
import test from "node:test";
import { isProductCode, productForTenantRoute } from "./products";

test("tenant 화면 경로를 제품으로 분류한다", () => {
  assert.equal(productForTenantRoute("/visibility-overview"), "AI_VISIBILITY");
  assert.equal(productForTenantRoute("/reports/report-1"), "AI_VISIBILITY");
  assert.equal(productForTenantRoute("/opportunities/content"), "SEARCH_CONTENT");
  assert.equal(productForTenantRoute("/youtube-aio/keyword-1?device=mobile"), "YOUTUBE");
});

test("홈과 관리 화면은 공통 기능으로 분류한다", () => {
  assert.equal(productForTenantRoute("/"), null);
  assert.equal(productForTenantRoute("/brands-management"), null);
  assert.equal(productForTenantRoute("/change-history"), null);
});

test("지원하는 제품 코드만 허용한다", () => {
  assert.equal(isProductCode("AI_VISIBILITY"), true);
  assert.equal(isProductCode("SEARCH_CONTENT"), true);
  assert.equal(isProductCode("YOUTUBE"), true);
  assert.equal(isProductCode("HOME"), false);
});
