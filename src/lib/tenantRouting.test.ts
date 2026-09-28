import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTenantRoute, tenantCookieValue, tenantFromCookie } from "./tenantRouting";

const cookie = tenantCookieValue({ org: "neodigm", brand: "neodigm" });

test("tenant pages carry org and brand from the URL", () => {
  assert.deepEqual(resolveTenantRoute("/salesforce/salesforce/youtube-aio/aiokw-1", "", null, cookie), {
    kind: "tenant",
    tenant: { org: "salesforce", brand: "salesforce" },
  });
  assert.deepEqual(resolveTenantRoute("/salesforce", "", null, null), { kind: "tenant", tenant: { org: "salesforce", brand: null } });
});

test("API calls use the calling page's tenant, then the last location", () => {
  assert.deepEqual(resolveTenantRoute("/api/prompts", "", "http://localhost:3000/salesforce/salesforce/prompt-library", cookie), {
    kind: "api",
    tenant: { org: "salesforce", brand: "salesforce" },
    source: "referer",
  });
  // a global page (or no referer) falls back to the cookie
  assert.deepEqual(resolveTenantRoute("/api/organizations", "", "http://localhost:3000/organizations", cookie), {
    kind: "api",
    tenant: { org: "neodigm", brand: "neodigm" },
    source: "cookie",
  });
  assert.deepEqual(resolveTenantRoute("/api/x", "", null, null), { kind: "api", tenant: null, source: "none" });
});

test("old unprefixed page URLs redirect into the current tenant", () => {
  assert.deepEqual(resolveTenantRoute("/youtube-aio", "?device=mobile", "http://h/salesforce/salesforce/brands-management", cookie), {
    kind: "redirect",
    to: "/salesforce/salesforce/youtube-aio?device=mobile",
  });
  assert.deepEqual(resolveTenantRoute("/brands-management/brand-1/connections", "", null, cookie), {
    kind: "redirect",
    to: "/neodigm/neodigm/brands-management/brand-1/connections",
  });
  assert.deepEqual(resolveTenantRoute("/prompt-library", "", null, null), { kind: "redirect", to: "/?next=%2Fprompt-library" });
});

test("global pages and static files pass through", () => {
  for (const path of ["/", "/help", "/help/youtube-aio", "/organizations", "/favicon.ico", "/file.svg", "/_next/static/x.js"]) {
    assert.deepEqual(resolveTenantRoute(path, "", null, cookie), { kind: "pass" }, path);
  }
});

test("cookie round trip", () => {
  assert.deepEqual(tenantFromCookie(tenantCookieValue({ org: "sales-force", brand: "salesforce-2" })), { org: "sales-force", brand: "salesforce-2" });
  assert.equal(tenantFromCookie("garbage"), null);
});
