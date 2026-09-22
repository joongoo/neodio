import { DEFAULT_BRAND_ID, DEFAULT_ORG_ID } from "@/lib/db";
import { getPromptStore } from "./database";

export async function listDetectedBrandDecisions(orgId = DEFAULT_ORG_ID, brandId = DEFAULT_BRAND_ID) {
  return (await getPromptStore()).listDetectedBrandDecisions(orgId, brandId);
}

export async function approveDetectedBrand(params: { name: string; evidenceDomain?: string | null }, orgId = DEFAULT_ORG_ID, brandId = DEFAULT_BRAND_ID) {
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

export async function excludeDetectedBrand(params: { name: string; evidenceDomain?: string | null }, orgId = DEFAULT_ORG_ID, brandId = DEFAULT_BRAND_ID) {
  await (await getPromptStore()).setDetectedBrandDecision(orgId, brandId, {
    name: params.name,
    status: "excluded",
    evidenceDomain: params.evidenceDomain,
  });
}

export async function clearDetectedBrandDecision(name: string, orgId = DEFAULT_ORG_ID, brandId = DEFAULT_BRAND_ID) {
  await (await getPromptStore()).clearDetectedBrandDecision(orgId, brandId, name);
}

export async function removeDetectedCompetitor(name: string, orgId = DEFAULT_ORG_ID, brandId = DEFAULT_BRAND_ID) {
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
  orgId = DEFAULT_ORG_ID,
  brandId = DEFAULT_BRAND_ID
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
  },
  orgId = DEFAULT_ORG_ID,
  brandId = DEFAULT_BRAND_ID
) {
  const store = await getPromptStore();
  await store.transaction(async () => {
    const brand = await store.getBrand(orgId, brandId);
    if (!brand) throw new Error(`Unknown brand: ${brandId}`);

    const ownAliases = [...new Set((params.ownAliases ?? []).map((name) => name.trim()).filter(Boolean))];
    const ownAliasSet = new Set(ownAliases.map((name) => name.toLocaleLowerCase("ko-KR")));
    const competitorItems = params.competitors ?? [];

    let otherBrands = brand.otherBrands.filter((other) => !ownAliasSet.has(other.name.toLocaleLowerCase("ko-KR")));
    for (const item of competitorItems) {
      const name = item.name.trim();
      if (!name) continue;
      const aliases = [...new Set((item.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))];
      const aliasSet = new Set(aliases.map((alias) => alias.toLocaleLowerCase("ko-KR")));
      const existing = otherBrands.find((other) => other.name.toLocaleLowerCase("ko-KR") === name.toLocaleLowerCase("ko-KR"));
      otherBrands = otherBrands.filter((other) => {
        const key = other.name.toLocaleLowerCase("ko-KR");
        return key === name.toLocaleLowerCase("ko-KR") || !aliasSet.has(key);
      });
      const next = { name: existing?.name ?? name, aliases: [...new Set([...(existing?.aliases ?? []), ...aliases])] };
      if (existing) otherBrands = otherBrands.map((other) => (other.name === existing.name ? next : other));
      else otherBrands.push(next);
      await store.setDetectedBrandDecision(orgId, brandId, { name, status: "approved", evidenceDomain: item.evidenceDomain });
      for (const alias of aliases) await store.clearDetectedBrandDecision(orgId, brandId, alias);
    }

    await store.updateBrand(orgId, brandId, {
      aliases: [...new Set([...brand.aliases, ...ownAliases])],
      otherBrands: otherBrands.filter((other) => !ownAliasSet.has(other.name.toLocaleLowerCase("ko-KR"))),
    });
    for (const alias of ownAliases) await store.clearDetectedBrandDecision(orgId, brandId, alias);
    for (const item of params.exclude ?? []) {
      if (item.name.trim()) await store.setDetectedBrandDecision(orgId, brandId, { name: item.name.trim(), status: "excluded", evidenceDomain: item.evidenceDomain });
    }
  });
}
