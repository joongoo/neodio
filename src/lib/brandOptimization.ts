// 브랜드 최적화 — "브랜드 이름들을 정리한다"는 한 가지 규칙을 여러 화면이 같이 쓰도록 모았다.
//   · 가시성 개요 > 상위 브랜드의 "브랜드 최적화"(응답에서 발견된 업체 후보 정리)
//   · 브랜드 설정 > 경쟁 브랜드 목록 정리(의미 없는 항목 제외, 자사 표기 이동)
// 프롬프트 만들기(build) → 응답 검증(parse) → 적용 규칙(apply)이 서버(detectedBrandDecisions)와
// 브랜드 설정 화면의 미리보기에서 같은 결과를 내도록 순수 함수로 둔다. 클라이언트에서도 쓰므로 서버 전용 코드를 가져오지 않는다.

export interface OptimizationOwnBrand {
  name: string;
  domain?: string;
  aliases: string[];
}

export interface OptimizationCompetitor {
  name: string;
  aliases: string[];
}

export interface OptimizationCandidate {
  name: string;
  mentions: number;
  evidenceDomain?: string | null;
}

export interface BrandOptimizationInput {
  own: OptimizationOwnBrand;
  /** 이미 경쟁 브랜드로 등록된 것 */
  registered: OptimizationCompetitor[];
  /** 수집 응답에서 새로 발견된 업체 후보(없을 수 있다) */
  candidates: OptimizationCandidate[];
}

export interface BrandOptimizationPlan {
  /** 자사 브랜드의 다른 표기 */
  ownAliases: string[];
  /** 같은 경쟁사의 다른 표기를 대표 이름 하나로 묶은 것 */
  competitors: OptimizationCompetitor[];
  /** 업체가 아닌 것(일반 개념어·부서·기능·분야명) — 경쟁 목록에 있으면 빼고, 후보에서는 숨긴다 */
  exclude: string[];
}

export const emptyPlan: BrandOptimizationPlan = { ownAliases: [], competitors: [], exclude: [] };

export const nameKey = (value: string) => value.trim().toLocaleLowerCase("ko-KR");

function unique(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(nameKey(trimmed))) continue;
    seen.add(nameKey(trimmed));
    result.push(trimmed);
  }
  return result;
}

export function buildBrandOptimizationPrompt({ own, registered, candidates }: BrandOptimizationInput): string {
  const lines: string[] = [];
  lines.push("다음 목록의 브랜드 이름들을 정리해주세요. 실제 브랜드/업체만 남기는 것이 목적입니다.", "");
  lines.push(`우리 브랜드: ${own.name}${own.domain ? ` (${own.domain})` : ""}${own.aliases.length ? ` — 이미 등록된 다른 표기: ${own.aliases.join(", ")}` : ""}`, "");
  if (registered.length > 0) {
    lines.push("이미 경쟁사로 등록된 브랜드:");
    for (const item of registered) lines.push(`- ${item.name}${item.aliases.length ? ` (등록된 다른 표기: ${item.aliases.join(", ")})` : ""}`);
    lines.push("");
  }
  if (candidates.length > 0) {
    lines.push("AI 답변에서 새로 발견된 업체 후보:");
    for (const item of candidates) lines.push(`- ${item.name} | 언급 ${item.mentions}회${item.evidenceDomain ? ` | 근거 도메인 ${item.evidenceDomain}` : ""}`);
    lines.push("");
  }
  lines.push(
    "규칙:",
    "- 우리 브랜드의 다른 표기(한글/영문/띄어쓰기/줄임말 등)로 판단되는 항목은 ownAliases에 넣으세요.",
    "- 같은 경쟁사의 다른 표기는 competitors에 대표 name 하나와 aliases로 묶으세요.",
    "- 업체명이 아니라 일반 개념어, 부서명, 기능명, 분야명, 제품 카테고리인 항목은 exclude에 넣으세요(경쟁사로 등록돼 있더라도 마찬가지입니다).",
    "- 위 목록에 없는 이름은 절대 만들지 마세요. 판단이 애매하면 넣지 마세요.",
    "- 바꿀 것이 없는 항목은 어디에도 넣지 않습니다.",
    "- 반드시 JSON 하나만 답하세요.",
    "",
    "응답 형식:",
    '{"ownAliases": ["우리 브랜드의 다른 표기"], "competitors": [{"name": "대표 경쟁사명", "aliases": ["다른 표기"]}], "exclude": ["제외할 이름"]}'
  );
  return lines.join("\n");
}

export type ParsedPlan = { plan: BrandOptimizationPlan; droppedCount: number } | { error: string };

/** 응답 원문 → 검증된 계획. 입력 목록에 없는 이름은 버리고(droppedCount), 자사 이름은 다른 분류로 들어가지 못하게 한다. */
export function parseBrandOptimization(raw: string, input: BrandOptimizationInput): ParsedPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      if (start === -1 || end <= start) throw new Error("no object");
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { error: "JSON 객체 형식이어야 합니다." };
  const data = parsed as Record<string, unknown>;

  // 화면이 아는 이름만 허용 — LLM이 지어낸 이름은 반영하지 않는다.
  const known = new Set<string>([
    ...input.registered.flatMap((r) => [r.name, ...r.aliases]),
    ...input.candidates.map((c) => c.name),
    ...input.own.aliases,
  ].map(nameKey));
  const ownKey = nameKey(input.own.name);
  let dropped = 0;
  const accept = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    if (nameKey(value) === ownKey || !known.has(nameKey(value))) {
      dropped += 1;
      return null;
    }
    return value.trim();
  };

  // 이미 등록된 자사 별칭을 다시 "이동"하자는 제안은 바뀌는 게 없으니 뺀다.
  const alreadyOwn = new Set(input.own.aliases.map(nameKey));
  const ownAliases = unique((Array.isArray(data.ownAliases) ? data.ownAliases : []).map(accept).filter((v): v is string => v !== null)).filter(
    (name) => !alreadyOwn.has(nameKey(name))
  );
  const exclude = unique(
    (Array.isArray(data.exclude) ? data.exclude : [])
      .map((item) => accept(typeof item === "object" && item !== null ? (item as { name?: unknown }).name : item))
      .filter((v): v is string => v !== null)
  ).filter((name) => !ownAliases.some((a) => nameKey(a) === nameKey(name)));
  const claimed = new Set([...ownAliases, ...exclude].map(nameKey));

  const competitors: OptimizationCompetitor[] = [];
  for (const item of Array.isArray(data.competitors) ? data.competitors : []) {
    const entry = item as { name?: unknown; aliases?: unknown };
    const name = accept(entry?.name);
    if (!name || claimed.has(nameKey(name))) continue;
    const aliases = unique(
      (Array.isArray(entry.aliases) ? entry.aliases : []).map(accept).filter((v): v is string => v !== null)
    ).filter((alias) => !claimed.has(nameKey(alias)) && nameKey(alias) !== nameKey(name));
    // 이미 등록된 경쟁사에 이미 들어 있는 별칭뿐이면 바뀌는 게 없다.
    const registered = input.registered.find((r) => nameKey(r.name) === nameKey(name));
    const knownAliases = new Set((registered?.aliases ?? []).map(nameKey));
    const newAliases = aliases.filter((alias) => !knownAliases.has(nameKey(alias)));
    if (registered && newAliases.length === 0) continue;
    competitors.push({ name, aliases });
  }
  if (ownAliases.length === 0 && exclude.length === 0 && competitors.length === 0) {
    return { error: "정리할 항목이 없습니다 — AI가 바꿀 것을 찾지 못했거나 목록에 없는 이름만 답했습니다." };
  }
  return { plan: { ownAliases, competitors, exclude }, droppedCount: dropped };
}

export interface BrandForOptimization {
  name: string;
  aliases: string[];
  otherBrands: OptimizationCompetitor[];
}

export interface AppliedOptimization {
  aliases: string[];
  otherBrands: OptimizationCompetitor[];
  /** 경쟁사로 확정(approved)할 대표 이름 */
  approved: string[];
  /** 제외(excluded)로 기록할 이름 */
  excluded: string[];
  /** 다른 항목의 별칭·자사 별칭으로 흡수돼 후보 결정을 지울 이름 */
  absorbed: string[];
}

/** 계획을 브랜드에 적용한 결과. 서버 저장과 화면 미리보기가 이 함수를 같이 쓴다. */
export function applyBrandOptimization(brand: BrandForOptimization, plan: BrandOptimizationPlan): AppliedOptimization {
  const ownKey = nameKey(brand.name);
  const ownAliases = unique(plan.ownAliases).filter((name) => nameKey(name) !== ownKey);
  const ownSet = new Set(ownAliases.map(nameKey));
  const excludeSet = new Set(plan.exclude.map(nameKey));
  ownSet.forEach((key) => excludeSet.delete(key));
  excludeSet.delete(ownKey);

  let otherBrands = brand.otherBrands.filter((other) => !ownSet.has(nameKey(other.name)) && !excludeSet.has(nameKey(other.name)));
  const approved: string[] = [];
  const absorbed: string[] = [...ownAliases];
  for (const item of plan.competitors) {
    const name = item.name.trim();
    const key = nameKey(name);
    if (!name || key === ownKey || ownSet.has(key) || excludeSet.has(key)) continue;
    const aliases = unique(item.aliases).filter((alias) => {
      const aliasKey = nameKey(alias);
      return aliasKey !== key && aliasKey !== ownKey && !ownSet.has(aliasKey) && !excludeSet.has(aliasKey);
    });
    const aliasSet = new Set(aliases.map(nameKey));
    const existing = otherBrands.find((other) => nameKey(other.name) === key);
    otherBrands = otherBrands.filter((other) => nameKey(other.name) === key || !aliasSet.has(nameKey(other.name)));
    const next = { name: existing?.name ?? name, aliases: unique([...(existing?.aliases ?? []), ...aliases]) };
    otherBrands = existing ? otherBrands.map((other) => (nameKey(other.name) === key ? next : other)) : [...otherBrands, next];
    approved.push(name);
    absorbed.push(...aliases);
  }
  return {
    aliases: unique([...brand.aliases, ...ownAliases]),
    otherBrands,
    approved,
    excluded: [...excludeSet].map((key) => plan.exclude.find((name) => nameKey(name) === key) ?? key),
    absorbed,
  };
}
