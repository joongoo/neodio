// 브랜드 최적화 — "브랜드 이름들을 정리한다"는 한 가지 규칙을 여러 화면이 같이 쓰도록 모았다.
//   · 가시성 개요 > 상위 브랜드의 "브랜드 최적화"(응답에서 발견된 업체 후보 정리)
//   · 브랜드 설정 > 경쟁 브랜드 목록 정리(의미 없는 항목 제외, 자사 표기 이동)
// 프롬프트 만들기(build) → 응답 검증(parse) → 적용 규칙(apply)이 서버(detectedBrandDecisions)와
// 브랜드 설정 화면의 미리보기에서 같은 결과를 내도록 순수 함수로 둔다. 클라이언트에서도 쓰므로 서버 전용 코드를 가져오지 않는다.

import type { BrandKind, CompetitorTier } from "@/lib/db/types";

export type { BrandKind, CompetitorTier };
export const COMPETITOR_TIERS: CompetitorTier[] = ["core", "adjacent", "enterprise", "niche"];
export const TIER_LABEL: Record<CompetitorTier, string> = { core: "핵심", adjacent: "인접", enterprise: "상위 시장", niche: "소규모 전문" };
export const isCompetitorTier = (value: unknown): value is CompetitorTier => typeof value === "string" && (COMPETITOR_TIERS as string[]).includes(value);
export const BRAND_KINDS: BrandKind[] = ["competitor", "solution", "partner", "channel", "other", "unclassified"];
export const BRAND_KIND_LABEL: Record<BrandKind, string> = {
  competitor: "경쟁사",
  solution: "솔루션·플랫폼",
  partner: "파트너·구축사",
  channel: "채널·매체",
  other: "기타",
  unclassified: "미분류",
};
export const isBrandKind = (value: unknown): value is BrandKind => typeof value === "string" && (BRAND_KINDS as string[]).includes(value);

/**
 * 자사 사업 유형을 설명에서 정한다 — 서비스 회사(에이전시·SI·컨설팅)인지, 제품 회사(소프트웨어·플랫폼)인지.
 * "파트너·구축사" 역할은 자사가 제품 회사일 때만 의미가 있다(자사가 에이전시면 같은 서비스를 파는 업체는 경쟁사).
 * 모델의 판단에 맡기면 경쟁 에이전시를 파트너로 분류해서, 코드에서 정한다. 서비스 단어가 있으면 서비스가 우선이고, 판단할 수 없으면 undefined.
 */
export type OwnBusinessType = "product" | "service";

export function inferBusinessType(description?: string): OwnBusinessType | undefined {
  if (!description) return undefined;
  if (/에이전시|대행|컨설팅|시스템\s*통합|\bSI\b|agency|consulting/i.test(description)) return "service";
  if (/소프트웨어|SaaS|플랫폼|클라우드|솔루션을\s*(만드|개발|제공|판매)|software|platform/i.test(description)) return "product";
  return undefined;
}

export interface OptimizationOwnBrand {
  name: string;
  domain?: string;
  aliases: string[];
  /** 자사가 무슨 사업을 하는지 — 경쟁사 판정의 기준이라 있으면 프롬프트에 넣는다. */
  description?: string;
  industry?: string;
  markets?: string[];
  /** 지정하면 설명에서 추정한 값보다 우선한다. */
  businessType?: OwnBusinessType;
}

export interface OptimizationCompetitor {
  name: string;
  aliases: string[];
  kind?: BrandKind;
  tier?: CompetitorTier;
  description?: string;
  origin?: "ai-suggested";
}

/** 수집된 답변에서 뽑은 브랜드별 근거 — 역할 판정에 쓴다(AI가 아니라 우리가 센 값). */
export interface BrandEvidence {
  /** 이 브랜드가 언급된 답변 수 */
  answers: number;
  /** 그중 자사도 함께 언급된 답변 수 */
  withOwn: number;
  /** 답변에서 이 브랜드가 소개된 대목 */
  snippet?: string;
}

/** 브랜드 하나의 역할 판정. */
export interface BrandRoleAssignment {
  name: string;
  kind: BrandKind;
  /** kind가 competitor일 때만 의미 있는 등급 */
  tier?: CompetitorTier;
  /** 답변 근거의 한 줄 설명 */
  description?: string;
  reason?: string;
}

/** AI가 목록에 없는 경쟁사를 자기 지식으로 제안한 것 — 미검증. */
export interface BrandSuggestion {
  name: string;
  tier?: CompetitorTier;
  description?: string;
  reason?: string;
}

export const MAX_SUGGESTIONS = 8;

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
  /** 브랜드 이름(nameKey) → 답변 근거. 있으면 프롬프트에 넣고 역할 분류를 요청한다. */
  evidence?: Record<string, BrandEvidence>;
}

export interface BrandOptimizationPlan {
  /** 자사 브랜드의 다른 표기 */
  ownAliases: string[];
  /** 같은 경쟁사의 다른 표기를 대표 이름 하나로 묶은 것 */
  competitors: OptimizationCompetitor[];
  /** 업체가 아닌 것(일반 개념어·부서·기능·분야명) — 경쟁 목록에 있으면 빼고, 후보에서는 숨긴다 */
  exclude: string[];
  /** 역할 분류(경쟁사·솔루션·채널…)와 한 줄 설명 */
  roles?: BrandRoleAssignment[];
  /** 목록에 없는 경쟁사 제안(미검증) */
  suggestions?: BrandSuggestion[];
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

/** "파트너·구축사" 역할을 쓸 수 있는 자사인지(제품 회사일 때만) — 프롬프트·검증·화면의 역할 선택이 같은 기준을 쓴다. */
export const allowsPartnerRole = (own: OptimizationOwnBrand) => (own.businessType ?? inferBusinessType(own.description)) === "product";
const allowPartner = allowsPartnerRole;

const snippetOf = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 150);

export function buildBrandOptimizationPrompt({ own, registered, candidates, evidence }: BrandOptimizationInput): string {
  const lines: string[] = [];
  const evidenceLine = (name: string) => {
    const e = evidence?.[nameKey(name)];
    if (!e) return "";
    return ` [답변 ${e.answers}개에서 언급, 그중 우리와 함께 ${e.withOwn}개${e.snippet ? ` | "${snippetOf(e.snippet)}"` : ""}]`;
  };
  // evidence가 주어지면(비어 있어도) 역할 분류와 경쟁사 추가 제안을 함께 요청한다 — 등록된 기타 브랜드가 없어도 제안은 가능하다.
  const classify = !!evidence;
  const kindChoices = BRAND_KINDS.filter((kind) => kind !== "partner" || allowPartner(own)).join("|");

  lines.push("다음 목록의 브랜드 이름들을 정리해주세요. 실제 브랜드/업체만 남기는 것이 목적입니다.", "");
  lines.push(`우리 브랜드: ${own.name}${own.domain ? ` (${own.domain})` : ""}${own.aliases.length ? ` — 이미 등록된 다른 표기: ${own.aliases.join(", ")}` : ""}`);
  if (own.description) lines.push(`우리 사업: ${own.description}${own.industry ? ` (업종: ${own.industry})` : ""}${own.markets?.length ? ` · 시장: ${own.markets.join(", ")}` : ""}`);
  lines.push("");
  if (registered.length > 0) {
    lines.push("이미 기타 브랜드로 등록된 것:");
    for (const item of registered) lines.push(`- ${item.name}${item.aliases.length ? ` (등록된 다른 표기: ${item.aliases.join(", ")})` : ""}${evidenceLine(item.name)}`);
    lines.push("");
  }
  const registeredKeys = new Set(registered.map((item) => nameKey(item.name)));
  const newCandidates = candidates.filter((item) => !registeredKeys.has(nameKey(item.name)));
  if (newCandidates.length > 0) {
    lines.push("AI 답변에서 새로 발견된 업체 후보:");
    for (const item of newCandidates) lines.push(`- ${item.name} | 언급 ${item.mentions}회${item.evidenceDomain ? ` | 근거 도메인 ${item.evidenceDomain}` : ""}${evidenceLine(item.name)}`);
    lines.push("");
  }
  lines.push(
    "규칙:",
    "- 우리 브랜드의 다른 표기(한글/영문/띄어쓰기/줄임말 등)로 판단되는 항목은 ownAliases에 넣으세요.",
    "- 같은 회사의 다른 표기는 competitors에 대표 name 하나와 aliases로 묶으세요(역할 분류와 별개로, 표기를 합칠 때만 씁니다).",
    "- exclude에는 회사가 아닌 것만 넣으세요: 직책, 일반 개념어, 부서명, 기능명, 분야명, 제품 카테고리. 소프트웨어·서비스를 파는 회사, 플랫폼, 매체는 회사이므로 exclude에 넣지 말고 역할로 분류하세요.",
    "- exclude와 competitors에는 아래 목록의 대표 이름만 쓰세요. 괄호 안 다른 표기나 그 회사의 제품명·하위 서비스명은 쓰지 마세요.",
    "- 위 목록에 없는 이름은 절대 만들지 마세요. 판단이 애매하면 넣지 마세요.",
    "- 바꿀 것이 없는 항목은 어디에도 넣지 않습니다.",
    "- 반드시 JSON 하나만 답하세요."
  );
  if (classify) {
    lines.push(
      "",
      "역할 분류(roles): exclude에 넣지 않은 등록 브랜드와 후보 전부에 대해 빠짐없이 우리와의 관계를 kind로 판정하세요.",
      "먼저 위 '우리 사업'을 읽고 우리가 (가) 소프트웨어 제품을 파는 회사인지, (나) 구축·컨설팅·대행 같은 서비스를 파는 회사인지 정한 뒤, 같은 유형의 공급자만 경쟁사로 보세요.",
      "예) 우리가 소프트웨어 구축·컨설팅 서비스를 제공하는 에이전시라면, 그 소프트웨어를 만드는 벤더·플랫폼 회사는 competitor가 아니라 solution이고, 같은 구축·컨설팅 서비스를 파는 다른 에이전시·SI·컨설팅사가 competitor입니다. 우리가 소프트웨어 제품을 파는 회사라면 같은 문제를 푸는 다른 제품(회사)이 competitor입니다.",
      '- "competitor"(경쟁사): 우리 고객이 같은 문제를 풀려고 우리 대신 고를 수 있는, 우리와 같은 유형의 공급자(같은 층위, 같은 시장·고객군). 핵심은 "대체 가능성"입니다. 단순히 서비스가 일부 겹치는 정도가 아니라, 비슷한 고객과 프로젝트 예산을 놓고 실제로 맞붙을 가능성이 있어야 합니다.',
      "  경쟁사 판단 기준: (1) 주요 고객군이 우리와 겹치는가 (2) 우리 사업 영역 중 2개 이상이 겹치는가 (3) 회사 규모가 너무 작지 않고 우리와 비슷하거나 한 단계 위인가 (4) 단순 광고대행·퍼포먼스 업체가 아니라 통합 마케팅·구축 역량이 있는가 (5) 우리 핵심 기술 영역의 구축 경험이 있으면 가중.",
      '  competitor에는 tier도 쓰세요: "core"(우리와 체급·서비스 포트폴리오가 가장 비슷함), "adjacent"(일부 핵심 영역에서 직접 경쟁하는 중견 업체), "enterprise"(우리보다 크지만 대형 프로젝트에서 맞붙을 수 있음), "niche"(소규모 전문 업체 — 핵심 경쟁사로 보지 않음). 규모·고객군을 답변 대목과 확실한 공개 정보로 판단할 수 없으면 core로 넣지 말고 tier를 비우세요.',
      '- "solution"(솔루션·플랫폼): 우리가 구축·연동·재판매하거나 도구로 쓰는 제품·플랫폼·소프트웨어와 그 회사(공급 쪽). 우리 고객이 우리 대신 사는 대상이 아닙니다.',
      ...(allowPartner(own)
        ? ['- "partner"(파트너·구축사): 우리가 소프트웨어 제품·플랫폼을 파는 회사이므로, 그 제품을 구축·판매·연동·운영해 주는 에이전시·SI·리셀러(판매·구축 쪽 협력 업체). 우리와 같은 제품을 파는 회사는 partner가 아니라 competitor입니다.']
        : []),
      '- "channel"(채널·매체): 고객과 만나는 매체·커뮤니티·SNS·포털·미디어.',
      '- "other"(기타): 위에 해당하지 않는 업체(예: 무관한 대기업).',
      '- "unclassified"(미분류): 근거가 부족하거나 판단이 애매함. 애매하면 competitor로 넣지 말고 이걸 쓰세요 — 잘못 넣은 경쟁사는 경쟁 비교를 왜곡합니다.',
      "- 우리와 함께 언급된 답변 수가 많다는 것만으로 경쟁사라고 판단하지 마세요. 파트너·솔루션도 함께 나옵니다. 답변에서 어떤 역할로 소개되는지를 보세요.",
      "- description에는 위 답변 대목에 근거한 한 줄 설명(60자 이내)을 쓰세요. 근거가 없으면 비우세요. reason에는 판정 이유를 짧게 쓰세요.",
      "",
      `경쟁사 추가 제안(suggestions): '우리 사업'과 같은 시장에서 경쟁하는, 위 목록에 없는 국내 업체를 ${MAX_SUGGESTIONS}개 이내로 제안하세요. 통합 마케팅 에이전시, 디지털·웹 구축 에이전시, 대기업 계열 마케팅·DX 회사, 관련 솔루션 파트너 SI처럼 우리 고객이 비교할 만한 유형을 두루 보세요. 웹 검색은 할 수 없으니 확실하지 않은 이름·규모는 지어내지 말고, 실존한다고 아는 업체만 쓰세요. 규모를 모르면 tier는 비우세요.`,
      "- 위 경쟁사 판단 기준과 등급 정의를 그대로 적용하세요. 소프트웨어 벤더·플랫폼(예: 우리가 구축하는 솔루션 회사)과 이미 위 목록에 있는 업체는 제안하지 마세요.",
      "- name은 공식 표기 하나, description은 사업을 한 줄(60자 이내), reason은 왜 우리와 경쟁하는지 짧게 쓰세요.",
      "",
      "응답 형식:",
      '{"ownAliases": ["우리 브랜드의 다른 표기"], "competitors": [{"name": "대표 이름", "aliases": ["다른 표기"]}], "exclude": ["제외할 이름"], "roles": [{"name": "브랜드", "kind": "' + kindChoices + '", "tier": "core|adjacent|enterprise|niche (competitor일 때만)", "description": "한 줄 설명", "reason": "판정 이유"}], "suggestions": [{"name": "목록에 없는 경쟁사", "tier": "core|adjacent|enterprise|niche", "description": "한 줄 설명", "reason": "경쟁 이유"}]}'
    );
  } else {
    lines.push(
      "",
      "응답 형식:",
      '{"ownAliases": ["우리 브랜드의 다른 표기"], "competitors": [{"name": "대표 경쟁사명", "aliases": ["다른 표기"]}], "exclude": ["제외할 이름"]}'
    );
  }
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
  // 제외는 등록된 브랜드나 후보의 대표 이름만 — 별칭·제품명을 제외 대상으로 삼는 답은 버린다.
  const excludable = new Set([...input.registered.map((r) => r.name), ...input.candidates.map((c) => c.name)].map(nameKey));
  const exclude = unique(
    (Array.isArray(data.exclude) ? data.exclude : [])
      .map((item) => accept(typeof item === "object" && item !== null ? (item as { name?: unknown }).name : item))
      .filter((v): v is string => v !== null)
      .filter((name) => {
        if (excludable.has(nameKey(name))) return true;
        dropped += 1;
        return false;
      })
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

  // 역할 분류 — 등록된 브랜드와 후보만 받고, 제외·자사 별칭으로 정리된 것은 역할을 매기지 않는다.
  const roleTargets = new Set([...input.registered.map((r) => r.name), ...input.candidates.map((c) => c.name)].map(nameKey));
  const roles: BrandRoleAssignment[] = [];
  const roleSeen = new Set<string>();
  for (const item of Array.isArray(data.roles) ? data.roles : []) {
    const entry = item as { name?: unknown; kind?: unknown; description?: unknown; reason?: unknown };
    if (typeof entry?.name !== "string" || !isBrandKind(entry.kind) || (entry.kind === "partner" && !allowPartner(input.own))) {
      dropped += 1;
      continue;
    }
    const key = nameKey(entry.name);
    if (!roleTargets.has(key) || key === ownKey || roleSeen.has(key) || claimed.has(key)) {
      dropped += 1;
      continue;
    }
    roleSeen.add(key);
    const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : undefined);
    const registered = input.registered.find((r) => nameKey(r.name) === key);
    const name = registered?.name ?? entry.name.trim();
    // 이미 같은 역할·설명이면 바뀌는 게 없다.
    const description = text(entry.description, 120);
    const rawTier = (entry as { tier?: unknown }).tier;
    const tier = entry.kind === "competitor" && isCompetitorTier(rawTier) ? rawTier : undefined;
    if (registered && registered.kind === entry.kind && registered.tier === tier && (!description || registered.description === description)) continue;
    roles.push({ name, kind: entry.kind, tier, description, reason: text(entry.reason, 160) });
  }

  // 추가 제안 — 목록에 없는 새 이름만, 미검증이라 개수·길이를 제한한다.
  const suggestions: BrandSuggestion[] = [];
  const suggestionSeen = new Set<string>([...known, ownKey]);
  if (input.evidence) {
    for (const item of Array.isArray(data.suggestions) ? data.suggestions : []) {
      const entry = item as { name?: unknown; tier?: unknown; description?: unknown; reason?: unknown };
      const name = typeof entry?.name === "string" ? entry.name.trim().replace(/\s+/g, " ") : "";
      const key = nameKey(name);
      if (!name || name.length > 60 || suggestionSeen.has(key) || suggestions.length >= MAX_SUGGESTIONS) {
        dropped += 1;
        continue;
      }
      suggestionSeen.add(key);
      const clip = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ").slice(0, max) : undefined);
      suggestions.push({ name, tier: isCompetitorTier(entry.tier) ? entry.tier : undefined, description: clip(entry.description, 120), reason: clip(entry.reason, 160) });
    }
  }

  if (ownAliases.length === 0 && exclude.length === 0 && competitors.length === 0 && roles.length === 0 && suggestions.length === 0) {
    return { error: "정리할 항목이 없습니다 — AI가 바꿀 것을 찾지 못했거나 목록에 없는 이름만 답했습니다." };
  }
  return { plan: { ownAliases, competitors, exclude, roles, suggestions }, droppedCount: dropped };
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
    const next = { ...existing, name: existing?.name ?? name, aliases: unique([...(existing?.aliases ?? []), ...aliases]) };
    otherBrands = existing ? otherBrands.map((other) => (nameKey(other.name) === key ? next : other)) : [...otherBrands, next];
    approved.push(name);
    absorbed.push(...aliases);
  }

  // 역할 분류 반영: 등록된 브랜드는 kind·description만 갱신하고, 아직 등록 안 된 후보는 경쟁사로 판정된 것만 새로 등록한다.
  for (const role of plan.roles ?? []) {
    const key = nameKey(role.name);
    if (!key || key === ownKey || ownSet.has(key) || excludeSet.has(key) || absorbed.some((name) => nameKey(name) === key)) continue;
    const existing = otherBrands.find((other) => nameKey(other.name) === key);
    if (existing) {
      otherBrands = otherBrands.map((other) => {
        if (other !== existing) return other;
        // 경쟁사가 아니게 바뀌면 등급도 지운다.
        const rest = { ...other };
        delete rest.tier;
        return { ...rest, kind: role.kind, ...(role.kind === "competitor" && role.tier ? { tier: role.tier } : {}), ...(role.description ? { description: role.description } : {}) };
      });
    } else if (role.kind === "competitor") {
      otherBrands = [...otherBrands, { name: role.name.trim(), aliases: [], kind: role.kind, ...(role.tier ? { tier: role.tier } : {}), ...(role.description ? { description: role.description } : {}) }];
      approved.push(role.name.trim());
    }
  }
  // AI 제안(미검증)은 사람이 고른 것만 들어온다 — 경쟁사로 등록하되 origin으로 미검증임을 남긴다.
  for (const item of plan.suggestions ?? []) {
    const name = item.name.trim();
    const key = nameKey(name);
    if (!name || key === ownKey || ownSet.has(key) || excludeSet.has(key) || otherBrands.some((other) => nameKey(other.name) === key)) continue;
    otherBrands = [
      ...otherBrands,
      { name, aliases: [], kind: "competitor", ...(item.tier ? { tier: item.tier } : {}), ...(item.description ? { description: item.description } : {}), origin: "ai-suggested" },
    ];
    approved.push(name);
  }
  return {
    aliases: unique([...brand.aliases, ...ownAliases]),
    otherBrands,
    approved,
    excluded: [...excludeSet].map((key) => plan.exclude.find((name) => nameKey(name) === key) ?? key),
    absorbed,
  };
}
