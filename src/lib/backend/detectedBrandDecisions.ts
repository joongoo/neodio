import { getPromptStore } from "./database";
import { applyBrandOptimization, nameKey, type BrandKind, type BrandRoleAssignment, type BrandSuggestion, type CompetitorTier } from "@/lib/brandOptimization";

export async function listDetectedBrandDecisions(orgId: string, brandId: string) {
  return (await getPromptStore()).listDetectedBrandDecisions(orgId, brandId);
}

export async function approveDetectedBrand(params: { name: string; evidenceDomain?: string | null }, orgId: string, brandId: string) {
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);
    const exists = brand.otherBrands.some((other) => other.name.toLocaleLowerCase("ko-KR") === params.name.toLocaleLowerCase("ko-KR"));
    if (!exists) {
      await store.updateBrand(orgId, brandId, { otherBrands: [...brand.otherBrands, { name: params.name, aliases: [] }] });
    }
    await store.setDetectedBrandDecision(orgId, brandId, { name: params.name, status: "approved", evidenceDomain: params.evidenceDomain });
  });
}

export async function excludeDetectedBrand(params: { name: string; evidenceDomain?: string | null }, orgId: string, brandId: string) {
  await (await getPromptStore()).setDetectedBrandDecision(orgId, brandId, {
    name: params.name,
    status: "excluded",
    evidenceDomain: params.evidenceDomain,
  });
}

export async function clearDetectedBrandDecision(name: string, orgId: string, brandId: string) {
  await (await getPromptStore()).clearDetectedBrandDecision(orgId, brandId, name);
}

export async function removeDetectedCompetitor(name: string, orgId: string, brandId: string) {
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);
    await store.updateBrand(orgId, brandId, {
      otherBrands: brand.otherBrands.filter((other) => other.name.toLocaleLowerCase("ko-KR") !== name.toLocaleLowerCase("ko-KR")),
    });
    await store.clearDetectedBrandDecision(orgId, brandId, name);
  });
}

export async function mergeDetectedBrands(
  brands: { name: string; mentions: number; evidenceDomain?: string | null }[],
  target: "competitor" | "own" = "competitor",
  orgId: string,
  brandId: string
) {
  if (brands.length < (target === "own" ? 1 : 2)) {
    throw new Error(target === "own" ? "내 브랜드로 등록할 브랜드를 선택해주세요." : "병합할 브랜드를 2개 이상 선택해주세요.");
  }
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);

    const uniqueBrands = [...new Map(brands.map((item) => [item.name.toLocaleLowerCase("ko-KR"), item])).values()];
    if (target === "own") {
      const aliases = uniqueBrands.map((item) => item.name);
      const aliasSet = new Set(aliases.map((name) => name.toLocaleLowerCase("ko-KR")));
      await store.updateBrand(orgId, brandId, {
        aliases: [...new Set([...brand.aliases, ...aliases])],
        otherBrands: brand.otherBrands.filter((other) => !aliasSet.has(other.name.toLocaleLowerCase("ko-KR"))),
      });
      for (const alias of aliases) await store.clearDetectedBrandDecision(orgId, brandId, alias);
      return;
    }

    const canonical = [...uniqueBrands].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name, "ko-KR"))[0];
    const aliases = uniqueBrands.filter((item) => item.name.toLocaleLowerCase("ko-KR") !== canonical.name.toLocaleLowerCase("ko-KR")).map((item) => item.name);
    const aliasSet = new Set(aliases.map((name) => name.toLocaleLowerCase("ko-KR")));

    const remaining = brand.otherBrands.filter((other) => {
      const key = other.name.toLocaleLowerCase("ko-KR");
      return key !== canonical.name.toLocaleLowerCase("ko-KR") && !aliasSet.has(key);
    });
    const existingCanonical = brand.otherBrands.find((other) => other.name.toLocaleLowerCase("ko-KR") === canonical.name.toLocaleLowerCase("ko-KR"));
    const nextCanonical = {
      ...existingCanonical,
      name: existingCanonical?.name ?? canonical.name,
      aliases: [...new Set([...(existingCanonical?.aliases ?? []), ...aliases])],
    };
    await store.updateBrand(orgId, brandId, { otherBrands: [...remaining, nextCanonical] });
    await store.setDetectedBrandDecision(orgId, brandId, { name: canonical.name, status: "approved", evidenceDomain: canonical.evidenceDomain });
    for (const alias of aliases) await store.clearDetectedBrandDecision(orgId, brandId, alias);
  });
}

export async function applyDetectedBrandOptimization(
  params: {
    ownAliases?: string[];
    competitors?: { name: string; aliases?: string[]; evidenceDomain?: string | null }[];
    exclude?: { name: string; evidenceDomain?: string | null }[];
    roles?: BrandRoleAssignment[];
    suggestions?: BrandSuggestion[];
  },
  orgId: string,
  brandId: string
) {
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);

    // 적용 규칙은 브랜드 설정 화면의 미리보기와 같은 함수(src/lib/brandOptimization.ts)를 쓴다.
    // 제외(exclude)는 이미 경쟁사로 등록된 항목도 목록에서 빼고 "제외" 결정으로 남긴다.
    const applied = applyBrandOptimization(brand, {
      ownAliases: params.ownAliases ?? [],
      competitors: (params.competitors ?? []).map((item) => ({ name: item.name, aliases: item.aliases ?? [] })),
      exclude: (params.exclude ?? []).map((item) => item.name),
      roles: params.roles ?? [],
      suggestions: params.suggestions ?? [],
    });
    await store.updateBrand(orgId, brandId, { aliases: applied.aliases, otherBrands: applied.otherBrands });

    const evidence = new Map<string, string | null | undefined>();
    for (const item of [...(params.competitors ?? []), ...(params.exclude ?? [])]) evidence.set(nameKey(item.name), item.evidenceDomain);
    for (const name of applied.approved) {
      await store.setDetectedBrandDecision(orgId, brandId, { name, status: "approved", evidenceDomain: evidence.get(nameKey(name)) });
    }
    for (const name of applied.absorbed) await store.clearDetectedBrandDecision(orgId, brandId, name);
    for (const name of applied.excluded) {
      await store.setDetectedBrandDecision(orgId, brandId, { name, status: "excluded", evidenceDomain: evidence.get(nameKey(name)) });
    }
  });
}

export interface BrandRoleChange {
  name: string;
  /** "excluded"는 업체가 아니라서 목록에서 뺀다(등록돼 있으면 기타 브랜드에서도 제거). */
  kind: BrandKind | "excluded";
  /** kind가 competitor일 때의 등급. null이면 등급을 지운다, 생략하면 그대로 둔다. */
  tier?: CompetitorTier | null;
  evidenceDomain?: string | null;
}

/**
 * 순위표에서 고른 브랜드들의 역할·등급을 한 번에 바꾼다.
 *  - 등록된 브랜드: kind(와 competitor일 때 tier)만 바꾼다. 다른 역할로 바꾸면 등급은 지운다.
 *  - 아직 등록 안 된 후보: 역할을 지정하면 기타 브랜드로 등록하고 "승인" 결정을 남긴다.
 *  - excluded: 등록돼 있으면 기타 브랜드에서 빼고, 어느 경우든 "제외" 결정을 남긴다.
 * 자사 이름은 무시한다.
 */
export async function setBrandRoles(changes: BrandRoleChange[], orgId: string, brandId: string) {
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);
    const ownKey = nameKey(brand.name);
    let otherBrands = [...brand.otherBrands];
    const decisions: { name: string; status: "approved" | "excluded"; evidenceDomain?: string | null }[] = [];

    for (const change of changes) {
      const name = change.name.trim();
      const key = nameKey(name);
      if (!name || key === ownKey) continue;
      const existing = otherBrands.find((other) => nameKey(other.name) === key);

      if (change.kind === "excluded") {
        otherBrands = otherBrands.filter((other) => nameKey(other.name) !== key);
        decisions.push({ name: existing?.name ?? name, status: "excluded", evidenceDomain: change.evidenceDomain });
        continue;
      }
      const tier = change.kind === "competitor" ? (change.tier === undefined ? existing?.tier : (change.tier ?? undefined)) : undefined;
      if (existing) {
        const { tier: _oldTier, ...rest } = existing;
        void _oldTier;
        otherBrands = otherBrands.map((other) => (other === existing ? { ...rest, kind: change.kind as BrandKind, ...(tier ? { tier } : {}) } : other));
      } else {
        otherBrands.push({ name, aliases: [], kind: change.kind, ...(tier ? { tier } : {}) });
        decisions.push({ name, status: "approved", evidenceDomain: change.evidenceDomain });
      }
    }

    await store.updateBrand(orgId, brandId, { otherBrands });
    for (const decision of decisions) await store.setDetectedBrandDecision(orgId, brandId, decision);
  });
}
