// 자사 설명을 기준으로 등록된 기타 브랜드와 수집 답변에서 나온 후보의 역할(경쟁사·솔루션·채널 …)을 AI로 분류한다.
// 화면의 "브랜드 최적화"와 같은 프롬프트·검증·적용 규칙(src/lib/brandOptimization.ts)을 쓴다.
//
//   npm run discover:brand-roles            # 결과만 보여 준다(저장 안 함)
//   npm run discover:brand-roles -- --apply # 등록된 기타 브랜드의 역할·설명만 저장한다(제외·병합·신규 등록은 화면에서)
import { getCurrentTenant } from "../src/lib/backend/tenant";
import { getRealBrandEvidence, getRealTopBrands } from "../src/lib/backend/collectionStatsReader";
import { getPromptStore } from "../src/lib/backend/database";
import { getLlmProvider } from "../src/lib/backend/llm/registry";
import { resolveApiKey } from "../src/lib/backend/llm/runner";
import { applyBrandOptimization, BRAND_KIND_LABEL, TIER_LABEL, buildBrandOptimizationPrompt, nameKey, parseBrandOptimization, type BrandOptimizationInput } from "../src/lib/brandOptimization";

const MAX_PROMPT_CHARS = 30_000; // /api/llm-generate와 같은 한도

async function main() {
  const apply = process.argv.includes("--apply");
  const tenant = await getCurrentTenant();
  const brand = tenant.brand;
  if (!brand) throw new Error("자사 브랜드가 없습니다.");

  const top = (await getRealTopBrands({ range: "4w" })) ?? [];
  const names = [...new Set([...brand.otherBrands.map((b) => b.name), ...top.map((row) => row.brand)])];
  const evidence = await getRealBrandEvidence(names);
  const input: BrandOptimizationInput = {
    own: { name: brand.name, aliases: brand.aliases, description: brand.description, industry: brand.industry, markets: brand.markets },
    registered: brand.otherBrands,
    candidates: top.map((row) => ({ name: row.brand, mentions: row.mentions, evidenceDomain: row.evidenceDomain ?? null })),
    evidence,
  };
  const prompt = buildBrandOptimizationPrompt(input);
  console.log(`자사: ${brand.name} — ${brand.description}`);
  console.log(`등록 ${brand.otherBrands.length}개 + 후보 ${top.filter((r) => r.source === "detected").length}개, 프롬프트 ${prompt.length}자`);
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`프롬프트가 ${MAX_PROMPT_CHARS}자를 넘습니다.`);

  const provider = getLlmProvider("gemini");
  const answer = await provider.ask(prompt, { apiKey: resolveApiKey(provider.apiKeyEnv), model: process.env[provider.modelEnv] || provider.defaultModel, webSearch: false });
  const parsed = parseBrandOptimization(answer.text, input);
  if ("error" in parsed) throw new Error(parsed.error);
  const { plan, droppedCount } = parsed;
  console.log(`\n무시한 항목 ${droppedCount}개 · 표기 병합 ${plan.competitors.length} · 제외 제안 ${plan.exclude.length} · 자사 별칭 ${plan.ownAliases.length}\n`);

  const registeredKeys = new Set(brand.otherBrands.map((b) => nameKey(b.name)));
  const roles = plan.roles ?? [];
  for (const kind of ["competitor", "solution", "partner", "channel", "other", "unclassified"] as const) {
    const rows = roles.filter((r) => r.kind === kind);
    if (!rows.length) continue;
    console.log(`■ ${BRAND_KIND_LABEL[kind]} (${rows.length})`);
    for (const r of rows) {
      const e = evidence[nameKey(r.name)];
      console.log(`  - ${r.name}${r.tier ? ` [${TIER_LABEL[r.tier]}]` : ""}${registeredKeys.has(nameKey(r.name)) ? "" : " [미등록 후보]"}  (답변 ${e?.answers ?? 0}, 자사 동반 ${e?.withOwn ?? 0}) ${r.description ?? ""}\n      ↳ ${r.reason ?? ""}`);
    }
  }
  if (plan.exclude.length) {
    console.log(`\n■ 삭제 제안 (${plan.exclude.length})`);
    for (const name of plan.exclude) console.log(`  - ${name}${plan.excludeReasons?.[nameKey(name)] ? ` — ${plan.excludeReasons[nameKey(name)]}` : ""}`);
  }
  // 웹 검색 없이 AI 지식만으로 제안한 목록에 없는 경쟁사 — 미검증이라 이 스크립트는 저장하지 않는다(화면의 브랜드 최적화에서 확인 후 등록).
  const suggestions = plan.suggestions ?? [];
  if (suggestions.length) {
    console.log(`\n■ AI 추가 제안(미검증, ${suggestions.length}개 — 저장하지 않음)`);
    for (const item of suggestions) console.log(`  - ${item.name}${item.tier ? ` [${TIER_LABEL[item.tier]}]` : ""}  ${item.description ?? ""}\n      ↳ ${item.reason ?? ""}`);
  }

  if (apply) {
    // 등록된 기타 브랜드의 역할·설명만 반영한다 — 이름 정리(제외·병합)나 신규 등록은 화면에서 확인하고 한다.
    const onlyRegistered = { ownAliases: [], competitors: [], exclude: [], roles: roles.filter((r) => registeredKeys.has(nameKey(r.name))) };
    const applied = applyBrandOptimization(brand, onlyRegistered);
    const store = await getPromptStore();
    await store.updateBrand(tenant.orgId, brand.id, { otherBrands: applied.otherBrands });
    console.log(`\n저장: 등록된 기타 브랜드 ${onlyRegistered.roles.length}개의 역할·설명`);
  }
}

main().then(() => process.exit(0), (error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
