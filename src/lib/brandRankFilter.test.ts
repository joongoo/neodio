import assert from "node:assert/strict";
import test from "node:test";
import type { BrandRankRow } from "@/lib/db/types";
import { countBrandRows, DEFAULT_ROLE_FILTER, DEFAULT_TIER_FILTER, filterBrandRows, roleBucketOf, rowKey, type BrandRoleInfo } from "./brandRankFilter";

const row = (brand: string, extra: Partial<BrandRankRow> = {}): BrandRankRow => ({ id: `r-${brand}`, brand, mentions: 1, ...extra });

const rows: BrandRankRow[] = [
  row("Neodigm", { isOwn: true }),
  row("Asiance"),
  row("Grazitti"),
  row("Zest Company"),
  row("KPR"),
  row("Adobe"),
  row("YouTube"),
  row("IBM"),
  row("CIO", { source: "detected" }),
  row("Junk", { source: "detected", decisionStatus: "excluded" }),
];
const info = new Map<string, BrandRoleInfo>([
  ["asiance", { kind: "competitor", tier: "adjacent" }],
  ["grazitti", { kind: "competitor" }],
  ["zest company", { kind: "competitor", tier: "niche" }],
  ["kpr", { kind: "competitor", tier: "adjacent" }],
  ["adobe", { kind: "solution" }],
  ["youtube", { kind: "channel" }],
  ["ibm", { kind: "other" }],
]);
const names = (list: BrandRankRow[]) => list.map((r) => r.brand);

test("roleBucketOf: own, excluded, registered roles, and everything unclassified falls into other", () => {
  assert.equal(roleBucketOf(rows[0]), "own");
  assert.equal(roleBucketOf(rows[9], undefined), "excluded");
  assert.equal(roleBucketOf(rows[1], info.get("asiance")), "competitor");
  assert.equal(roleBucketOf(rows[5], info.get("adobe")), "solution");
  assert.equal(roleBucketOf(rows[8]), "other", "역할이 없는 신규 후보");
  assert.equal(roleBucketOf(rows[7], info.get("ibm")), "other");
  assert.equal(rowKey(row("Zest Company")), "zest company");
});

test("default filter shows own + competitors (niche hidden), never excluded rows", () => {
  const shown = filterBrandRows(rows, info, new Set(DEFAULT_ROLE_FILTER), new Set(DEFAULT_TIER_FILTER));
  assert.deepEqual(names(shown), ["Neodigm", "Asiance", "Grazitti", "KPR"]);
});

test("tier sub-filter only applies to competitors; other roles ignore it", () => {
  const onlyCore = filterBrandRows(rows, info, new Set(["competitor", "solution"] as const), new Set(["core"] as const));
  assert.deepEqual(names(onlyCore), ["Adobe"], "경쟁사는 core만 남고(없음), 솔루션은 등급과 무관하게 남는다");
  const withNiche = filterBrandRows(rows, info, new Set(["competitor"] as const), new Set(["niche"] as const));
  assert.deepEqual(names(withNiche), ["Zest Company"]);
  const none = filterBrandRows(rows, info, new Set(["competitor"] as const), new Set(["none"] as const));
  assert.deepEqual(names(none), ["Grazitti"], "등급 미정");
});

test("enabling other shows unclassified candidates too; excluded stays hidden even with every role on", () => {
  const all = filterBrandRows(rows, info, new Set(["own", "competitor", "solution", "partner", "channel", "other"] as const), new Set(["core", "adjacent", "enterprise", "niche", "none"] as const));
  assert.equal(all.length, rows.length - 1);
  assert.ok(!names(all).includes("Junk"));
  assert.ok(names(all).includes("CIO"));
});

test("countBrandRows gives per-role and per-tier counts without excluded rows", () => {
  const { roles, tiers, excluded } = countBrandRows(rows, info);
  assert.equal(excluded, 1);
  assert.deepEqual(roles, { own: 1, competitor: 4, solution: 1, partner: 0, channel: 1, other: 2 });
  assert.deepEqual(tiers, { core: 0, adjacent: 2, enterprise: 0, niche: 1, none: 1 });
});
