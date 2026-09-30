import assert from "node:assert/strict";
import test from "node:test";
import { createGoogleOAuthState, findMatchingGscProperty, verifyGoogleOAuthState } from "./googleOAuth";

process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret";

test("OAuth state를 서명하고 위변조를 거부한다", () => {
  const state = createGoogleOAuthState({ brandId: "brand-1", organizationId: "org-1", returnTo: "/org/brand/connections" });
  assert.equal(verifyGoogleOAuthState(state)?.brandId, "brand-1");
  assert.equal(verifyGoogleOAuthState(`${state}x`), null);
});

test("브랜드 도메인과 같은 domain property를 URL-prefix보다 우선한다", () => {
  const property = findMatchingGscProperty(
    [{ siteUrl: "https://www.example.com/" }, { siteUrl: "sc-domain:example.com" }],
    "https://example.com"
  );
  assert.equal(property, "sc-domain:example.com");
});

test("www 차이를 무시하고 URL-prefix property를 매칭한다", () => {
  const property = findMatchingGscProperty([{ siteUrl: "https://www.example.com/" }], "https://example.com/path");
  assert.equal(property, "https://www.example.com/");
});

test("다른 도메인만 있으면 자동 연결하지 않는다", () => {
  const property = findMatchingGscProperty([{ siteUrl: "sc-domain:other.example" }], "https://example.com");
  assert.equal(property, null);
});
