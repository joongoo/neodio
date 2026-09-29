import assert from "node:assert/strict";
import test from "node:test";
import { applyBrandOptimization, buildBrandOptimizationPrompt, inferBusinessType, parseBrandOptimization, type BrandOptimizationInput } from "./brandOptimization";

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

// ---- 역할 분류(경쟁사·솔루션·채널) ----

const roleInput: BrandOptimizationInput = {
  own: { name: "Neodigm", aliases: [], description: "Adobe 공식 파트너 마케팅 에이전시", industry: "B2B SaaS", markets: ["한국"] },
  registered: [
    { name: "Adobe", aliases: [] },
    { name: "DKBMC", aliases: [], kind: "unclassified" },
    { name: "YouTube", aliases: [] },
  ],
  candidates: [{ name: "Grazitti", mentions: 3 }, { name: "CIO", mentions: 9 }],
  evidence: {
    adobe: { answers: 34, withOwn: 30, snippet: "Adobe Marketo Engage 공식 파트너사 네오다임" },
    dkbmc: { answers: 3, withOwn: 1 },
  },
};

test("prompt asks for roles only when evidence is provided, and carries the own business and evidence", () => {
  const withRoles = buildBrandOptimizationPrompt(roleInput);
  assert.match(withRoles, /우리 사업: Adobe 공식 파트너 마케팅 에이전시 \(업종: B2B SaaS\) · 시장: 한국/);
  assert.match(withRoles, /- Adobe \[답변 34개에서 언급, 그중 우리와 함께 30개 \| "Adobe Marketo Engage 공식 파트너사 네오다임"\]/);
  assert.match(withRoles, /"roles"/);
  assert.match(withRoles, /함께 언급된 답변 수가 많다는 것만으로 경쟁사라고 판단하지 마세요/);
  assert.doesNotMatch(buildBrandOptimizationPrompt({ ...roleInput, evidence: undefined }), /"roles"/);
});

test("parse keeps valid roles, drops unknown names / bad kinds / duplicates / own, and skips no-op roles", () => {
  const raw = JSON.stringify({
    exclude: ["CIO"],
    roles: [
      { name: "Adobe", kind: "solution", description: "  Marketo를 만드는 솔루션 회사 ", reason: "파트너로 소개됨" },
      { name: "adobe", kind: "competitor" },
      { name: "DKBMC", kind: "unclassified" },
      { name: "Grazitti", kind: "competitor", description: "마케팅 자동화 구축 에이전시" },
      { name: "YouTube", kind: "hero" },
      { name: "만들어낸이름", kind: "competitor" },
      { name: "Neodigm", kind: "competitor" },
      { name: "CIO", kind: "other" },
    ],
  });
  const result = parseBrandOptimization(raw, roleInput);
  assert.ok("plan" in result);
  assert.deepEqual(
    result.plan.roles?.map((r) => [r.name, r.kind, r.description]),
    [["Adobe", "solution", "Marketo를 만드는 솔루션 회사"], ["Grazitti", "competitor", "마케팅 자동화 구축 에이전시"]]
  );
  assert.equal(result.droppedCount, 5, "중복 adobe, 잘못된 kind, 없는 이름, 자사, 제외된 CIO");
});

test("apply sets kind/description on registered brands, registers only competitor-kind candidates, and never resurrects absorbed aliases", () => {
  const brand = { name: "Neodigm", aliases: [], otherBrands: [{ name: "Adobe", aliases: [] }, { name: "DKBMC", aliases: [], kind: "competitor" as const, description: "기존 설명" }] };
  const applied = applyBrandOptimization(brand, {
    ownAliases: [],
    competitors: [{ name: "DKBMC", aliases: ["디케이비엠씨"] }],
    exclude: [],
    roles: [
      { name: "Adobe", kind: "solution", description: "솔루션 회사" },
      { name: "Grazitti", kind: "competitor", description: "구축 에이전시" },
      { name: "Zapier", kind: "solution" },
      { name: "디케이비엠씨", kind: "competitor" },
    ],
  });
  const byName = Object.fromEntries(applied.otherBrands.map((o) => [o.name, o]));
  assert.equal(byName.Adobe.kind, "solution");
  assert.equal(byName.Adobe.description, "솔루션 회사");
  assert.equal(byName.Grazitti.kind, "competitor", "경쟁사로 판정된 후보는 등록된다");
  assert.equal(byName.Zapier, undefined, "솔루션 후보는 등록하지 않는다");
  assert.equal(byName["디케이비엠씨"], undefined, "다른 항목의 별칭으로 흡수된 이름은 되살리지 않는다");
  assert.equal(byName.DKBMC.description, "기존 설명", "병합해도 기존 역할·설명은 유지된다");
  assert.ok(applied.approved.includes("Grazitti"));
});

test("exclude accepts only representative names, not aliases or product names of a registered brand", () => {
  const withAliases: BrandOptimizationInput = { ...roleInput, registered: [{ name: "Adobe", aliases: ["Adobe Firefly", "Adobe Newsroom"] }] };
  const result = parseBrandOptimization(JSON.stringify({ exclude: ["Adobe Firefly", "CIO"], roles: [] }), withAliases);
  assert.ok("plan" in result);
  assert.deepEqual(result.plan.exclude, ["CIO"]);
  assert.equal(result.droppedCount, 1);
});

test("prompt tells the model to judge business type first and not to exclude real companies", () => {
  const text = buildBrandOptimizationPrompt(roleInput);
  assert.match(text, /같은 유형의 공급자만 경쟁사로 보세요/);
  assert.match(text, /exclude에 넣지 말고 역할로 분류하세요/);
  assert.match(text, /exclude에 넣지 않은 등록 브랜드와 후보 전부/);
});

test("competitor tier is accepted only for competitors, stored on apply, and cleared when the role changes", () => {
  const raw = JSON.stringify({
    roles: [
      { name: "DKBMC", kind: "competitor", tier: "core" },
      { name: "Adobe", kind: "solution", tier: "core" },
      { name: "Grazitti", kind: "competitor", tier: "giant" },
    ],
  });
  const result = parseBrandOptimization(raw, roleInput);
  assert.ok("plan" in result);
  const byName = Object.fromEntries((result.plan.roles ?? []).map((r) => [r.name, r]));
  assert.equal(byName.DKBMC.tier, "core");
  assert.equal(byName.Adobe.tier, undefined, "경쟁사가 아니면 등급은 버린다");
  assert.equal(byName.Grazitti.tier, undefined, "정해진 등급이 아니면 버린다");

  const brand = { name: "Neodigm", aliases: [], otherBrands: [{ name: "DKBMC", aliases: [], kind: "competitor" as const, tier: "core" as const }] };
  const applied = applyBrandOptimization(brand, { ownAliases: [], competitors: [], exclude: [], roles: [{ name: "DKBMC", kind: "solution" }] });
  assert.equal(applied.otherBrands[0].kind, "solution");
  assert.equal(applied.otherBrands[0].tier, undefined);
  const promoted = applyBrandOptimization(brand, { ownAliases: [], competitors: [], exclude: [], roles: [{ name: "DKBMC", kind: "competitor", tier: "adjacent" }] });
  assert.equal(promoted.otherBrands[0].tier, "adjacent");
});

test("prompt carries the competitor criteria and tier definitions", () => {
  const text = buildBrandOptimizationPrompt(roleInput);
  assert.match(text, /경쟁사 판단 기준: \(1\) 주요 고객군/);
  assert.match(text, /"core"\(우리와 체급·서비스 포트폴리오가 가장 비슷함\)/);
  assert.match(text, /"niche"\(소규모 전문 업체/);
});

test("suggestions: only new names, capped, deduped, never own or already known; apply registers them as unverified competitors", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ name: `신규업체${i}`, tier: "adjacent", description: "설명" }));
  const raw = JSON.stringify({
    suggestions: [
      { name: "Adobe", tier: "core" },
      { name: "Neodigm", tier: "core" },
      { name: "  이노션  ", tier: "enterprise", description: "종합 광고대행사", reason: "대기업 고객" },
      { name: "이노션", tier: "core" },
      { name: "Grazitti", tier: "adjacent" },
      { name: "잘못된등급", tier: "giant" },
      ...many,
    ],
  });
  const result = parseBrandOptimization(raw, roleInput);
  assert.ok("plan" in result);
  const list = result.plan.suggestions ?? [];
  assert.equal(list.length, 8, "최대 8개");
  assert.equal(list[0].name, "이노션");
  assert.equal(list[0].tier, "enterprise");
  assert.ok(!list.some((s) => ["Adobe", "Neodigm", "Grazitti"].includes(s.name)), "등록된 이름·자사·후보는 제외");
  assert.equal(list.find((s) => s.name === "잘못된등급")?.tier, undefined);

  // 증거(evidence)가 없는 입력(이름 정리만 하는 호출)에서는 제안을 받지 않는다.
  const noEvidence = parseBrandOptimization(raw, { ...roleInput, evidence: undefined });
  assert.ok("error" in noEvidence);

  const brand = { name: "Neodigm", aliases: [], otherBrands: [] };
  const applied = applyBrandOptimization(brand, { ownAliases: [], competitors: [], exclude: [], suggestions: [{ name: "이노션", tier: "enterprise", description: "종합 광고대행사" }] });
  assert.deepEqual(applied.otherBrands, [{ name: "이노션", aliases: [], kind: "competitor", tier: "enterprise", description: "종합 광고대행사", origin: "ai-suggested" }]);
  assert.deepEqual(applied.approved, ["이노션"]);
});

test("prompt asks for suggestions without web search and forbids inventing or repeating names", () => {
  const text = buildBrandOptimizationPrompt(roleInput);
  assert.match(text, /경쟁사 추가 제안\(suggestions\)/);
  assert.match(text, /웹 검색은 할 수 없으니 확실하지 않은 이름·규모는 지어내지 말고, 실존한다고 아는 업체만/);
  assert.match(text, /"suggestions": \[/);
  assert.doesNotMatch(buildBrandOptimizationPrompt({ ...roleInput, evidence: undefined }), /suggestions/);
});

test("inferBusinessType reads the own description; service words win over product words", () => {
  assert.equal(inferBusinessType("Adobe 공식 파트너인 B2B 마케팅·MarTech 에이전시. Marketo 구축·운영·컨설팅"), "service");
  assert.equal(inferBusinessType("글로벌 CRM과 마케팅 클라우드를 만드는 엔터프라이즈 소프트웨어 회사"), "product");
  assert.equal(inferBusinessType("클라우드 플랫폼 구축 컨설팅 에이전시"), "service");
  assert.equal(inferBusinessType("생활용품 제조사"), undefined);
  assert.equal(inferBusinessType(undefined), undefined);
});

test("partner role exists only when the own brand sells a product: prompt offers it and parse accepts it", () => {
  const productOwn: BrandOptimizationInput = { ...roleInput, own: { name: "Salesforce", aliases: [], description: "CRM 클라우드를 만드는 소프트웨어 회사" } };
  const text = buildBrandOptimizationPrompt(productOwn);
  assert.match(text, /"partner"\(파트너·구축사\)/);
  assert.match(text, /"kind": "competitor\|solution\|partner\|channel\|other\|unclassified"/);
  const ok = parseBrandOptimization(JSON.stringify({ roles: [{ name: "DKBMC", kind: "partner", tier: "core", description: "구축 파트너" }] }), productOwn);
  assert.ok("plan" in ok);
  assert.deepEqual(ok.plan.roles?.map((r) => [r.name, r.kind, r.tier]), [["DKBMC", "partner", undefined]]);

  // 자사가 에이전시(서비스 회사)면 프롬프트에 partner가 없고, 모델이 partner로 답해도 버린다.
  const serviceText = buildBrandOptimizationPrompt(roleInput);
  assert.doesNotMatch(serviceText, /"partner"\(파트너·구축사\)/);
  assert.doesNotMatch(serviceText, /competitor\|solution\|partner/);
  const dropped = parseBrandOptimization(JSON.stringify({ roles: [{ name: "DKBMC", kind: "partner" }, { name: "Adobe", kind: "solution" }] }), roleInput);
  assert.ok("plan" in dropped);
  assert.deepEqual(dropped.plan.roles?.map((r) => r.name), ["Adobe"]);
  assert.equal(dropped.droppedCount, 1);
});
