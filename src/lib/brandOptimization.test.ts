import assert from "node:assert/strict";
import test from "node:test";
import { applyBrandOptimization, buildBrandOptimizationPrompt, parseBrandOptimization, type BrandOptimizationInput } from "./brandOptimization";

const input: BrandOptimizationInput = {
  own: { name: "Neodigm", domain: "neodigm.com", aliases: ["네오다임"] },
  registered: [
    { name: "마케팅 자동화", aliases: [] },
    { name: "Neodigm Korea", aliases: [] },
    { name: "HubSpot", aliases: [] },
  ],
  candidates: [
    { name: "허브스팟", mentions: 4 },
    { name: "Salesforce", mentions: 3, evidenceDomain: "salesforce.com" },
  ],
};

test("prompt lists own brand, registered competitors and candidates", () => {
  const text = buildBrandOptimizationPrompt(input);
  assert.match(text, /우리 브랜드: Neodigm \(neodigm.com\)/);
  assert.match(text, /- HubSpot/);
  assert.match(text, /- 허브스팟 \| 언급 4회/);
});

test("parse drops invented names and keeps own brand out of other buckets", () => {
  const raw = "```json\n" + JSON.stringify({
    ownAliases: ["Neodigm Korea", "만들어낸이름"],
    competitors: [{ name: "HubSpot", aliases: ["허브스팟", "Neodigm"] }],
    exclude: [{ name: "마케팅 자동화" }, "Neodigm"],
  }) + "\n```";
  const result = parseBrandOptimization(raw, input);
  assert.ok("plan" in result);
  assert.deepEqual(result.plan.ownAliases, ["Neodigm Korea"]);
  assert.deepEqual(result.plan.competitors, [{ name: "HubSpot", aliases: ["허브스팟"] }]);
  assert.deepEqual(result.plan.exclude, ["마케팅 자동화"]);
  assert.equal(result.droppedCount, 3);
});

test("parse ignores suggestions that change nothing (already own aliases, aliases already merged)", () => {
  const result = parseBrandOptimization(
    JSON.stringify({ ownAliases: ["네오다임"], competitors: [{ name: "HubSpot", aliases: [] }], exclude: [] }),
    input
  );
  assert.ok("error" in result);
  const merged = parseBrandOptimization(
    JSON.stringify({ ownAliases: [], competitors: [{ name: "HubSpot", aliases: ["허브스팟"] }], exclude: [] }),
    { ...input, registered: [{ name: "HubSpot", aliases: ["허브스팟"] }] }
  );
  assert.ok("error" in merged);
});

test("parse rejects non-JSON and empty results", () => {
  assert.ok("error" in parseBrandOptimization("죄송합니다", input));
  assert.ok("error" in parseBrandOptimization(`{"ownAliases":[],"competitors":[],"exclude":[]}`, input));
});

test("apply moves own-brand spellings, excludes registered non-brands and merges competitor aliases", () => {
  const brand = {
    name: "Neodigm",
    aliases: ["네오다임"],
    otherBrands: [
      { name: "마케팅 자동화", aliases: [] },
      { name: "Neodigm Korea", aliases: [] },
      { name: "HubSpot", aliases: [] },
      { name: "허브스팟", aliases: [] },
    ],
  };
  const result = applyBrandOptimization(brand, {
    ownAliases: ["Neodigm Korea"],
    competitors: [{ name: "HubSpot", aliases: ["허브스팟"] }],
    exclude: ["마케팅 자동화"],
  });
  assert.deepEqual(result.aliases, ["네오다임", "Neodigm Korea"]);
  assert.deepEqual(result.otherBrands, [{ name: "HubSpot", aliases: ["허브스팟"] }]);
  assert.deepEqual(result.excluded, ["마케팅 자동화"]);
  assert.deepEqual(result.approved, ["HubSpot"]);
  assert.deepEqual(result.absorbed.sort(), ["Neodigm Korea", "허브스팟"]);
});

test("apply never removes or renames the own brand and is idempotent", () => {
  const brand = { name: "Neodigm", aliases: [], otherBrands: [{ name: "HubSpot", aliases: [] }] };
  const plan = { ownAliases: ["neodigm"], competitors: [{ name: "HubSpot", aliases: [] }], exclude: ["Neodigm"] };
  const once = applyBrandOptimization(brand, plan);
  assert.deepEqual(once.aliases, []);
  assert.deepEqual(once.excluded, []);
  const twice = applyBrandOptimization({ ...brand, aliases: once.aliases, otherBrands: once.otherBrands }, plan);
  assert.deepEqual(twice.otherBrands, once.otherBrands);
});
