import assert from "node:assert/strict";
import { test } from "node:test";
import { assignBrandSlugs, brandSlugFromUrl, orgSlugError, slugifyName } from "./slug";

test("brandSlugFromUrl drops www and the (country) TLD", () => {
  assert.equal(brandSlugFromUrl("https://www.salesforce.com"), "salesforce");
  assert.equal(brandSlugFromUrl("https://neodigm.com"), "neodigm");
  assert.equal(brandSlugFromUrl("neodigm.co.kr"), "neodigm");
  assert.equal(brandSlugFromUrl("https://blog.neodigm.com/ko"), "blog-neodigm");
  assert.equal(brandSlugFromUrl("https://slack.com/intl/ko-kr"), "slack");
  assert.equal(brandSlugFromUrl("not a url ::"), "");
});

test("assignBrandSlugs: first brand wins, duplicates get -2, Demo is demo, Korean names use the URL", () => {
  const slugs = assignBrandSlugs([
    { id: "a", name: "세일즈포스 코리아", url: "https://www.salesforce.com" },
    { id: "b", name: "Salesforce US", url: "https://salesforce.com/us" },
    { id: "c", name: "Demo", url: "https://demo.neodio.app" },
    { id: "d", name: "Neo Digm", url: "" },
  ]);
  assert.deepEqual(Object.fromEntries(slugs), { a: "salesforce", b: "salesforce-2", c: "demo", d: "neo-digm" });
});

test("orgSlugError", () => {
  assert.equal(orgSlugError("salesforce"), null);
  assert.equal(orgSlugError("sales-force-kr"), null);
  assert.match(orgSlugError("Salesforce")!, /소문자/);
  assert.match(orgSlugError("-sf")!, /하이픈/);
  assert.match(orgSlugError("s")!, /2~40자/);
  assert.match(orgSlugError("youtube-aio")!, /겹쳐/);
  assert.match(orgSlugError("api")!, /겹쳐/);
  assert.equal(slugifyName("Neodigm 조직"), "neodigm");
});
