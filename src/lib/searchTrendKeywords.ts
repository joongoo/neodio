// 검색어 트렌드 주제어 그룹의 "검색어 정리" — 브랜드 관리의 별칭이 지저분해도(제품명·오타·다른 회사 이름이 섞임)
// 네이버 데이터랩에 넣기 좋은 검색어로 AI가 다듬게 하는 규칙을 모았다. 프롬프트 만들기(build) → 응답 검증(parse)이
// 화면과 테스트에서 같은 결과를 내도록 순수 함수로 두며, 서버 전용 코드를 가져오지 않는다.

export interface KeywordGroupInput {
  groupName: string;
  keywords: string[];
}

export interface KeywordChange {
  keyword: string;
  /** AI가 밝힌 이유(제거된 항목만). */
  reason?: string;
}

export interface KeywordGroupPlan {
  groupName: string;
  /** 원래 있던 것 중 그대로 두는 검색어(주제어 자신 포함). */
  kept: string[];
  /** 원래 없던 것을 AI가 새로 넣자고 한 검색어. */
  added: string[];
  /** 원래 있던 것 중 AI가 빼자고 한 검색어. */
  removed: KeywordChange[];
}

export const MAX_KEYWORDS_PER_GROUP = 8;

export const keywordKey = (value: string) => value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = keywordKey(v);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildKeywordCleanupPrompt(groups: KeywordGroupInput[]): string {
  const lines: string[] = [];
  lines.push(
    "네이버 데이터랩 '검색어 트렌드'에 넣을 주제어 그룹의 검색어를 정리해주세요.",
    "그룹 하나는 브랜드(업체) 하나이고, 그 그룹의 검색어 합계가 이 브랜드에 대한 네이버 검색 관심도가 됩니다.",
    "",
    "현재 그룹:"
  );
  for (const g of groups) lines.push(`- ${g.groupName}: ${g.keywords.join(", ")}`);
  lines.push(
    "",
    "규칙:",
    `- 그룹마다 검색어는 최대 ${MAX_KEYWORDS_PER_GROUP}개, 주제어(그룹 이름) 자신은 반드시 포함하세요.`,
    "- 사용자가 네이버에 그 브랜드를 찾으려고 실제로 입력할 만한 표기(한글 표기, 영문 표기, 띄어쓰기 변형, 널리 쓰는 줄임말)만 남기세요.",
    "- 제품명·서비스명·하위 브랜드·부서명·행사명(예: 'Adobe Firefly', 'Adobe Newsroom')은 빼세요. 브랜드 자체의 검색량이 아니라 제품 검색량이 섞입니다.",
    "- 다른 회사 이름이 섞인 항목(예: 'Marketo HubSpot'), 오타, 정식 표기가 아닌 잘못된 이름은 빼세요.",
    "- 그 브랜드만을 뜻하지 않는 일반 단어(예: '다음', '먼데이', '에이전시', '퍼포먼스')는 빼세요. 단독으로는 다른 뜻으로 더 많이 검색됩니다.",
    "- 빠진 대표 표기가 확실하면(예: 'Salesforce'의 '세일즈포스') 추가해도 됩니다. 확실하지 않으면 추가하지 마세요.",
    "- 한 검색어를 두 그룹에 넣지 마세요. 위 목록에 없는 그룹은 만들지 마세요.",
    "- 빼는 검색어마다 짧은 이유를 적으세요.",
    "- 반드시 JSON 하나만 답하세요.",
    "",
    "응답 형식:",
    '{"groups": [{"name": "그룹 이름", "keywords": ["남길·추가할 검색어"], "removed": [{"keyword": "뺄 검색어", "reason": "이유"}]}]}'
  );
  return lines.join("\n");
}

export type ParsedKeywordPlan = { plans: KeywordGroupPlan[]; droppedCount: number } | { error: string };

/** 응답 원문 → 검증된 그룹별 정리안. 목록에 없는 그룹은 버리고, 다른 그룹과 겹치는 검색어와 개수 초과분도 정리한다. */
export function parseKeywordCleanup(raw: string, groups: KeywordGroupInput[]): ParsedKeywordPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // LLM이 ```json 코드 펜스나 앞뒤 설명을 붙여 답해도 받도록 { ... } 구간만 다시 해석한다.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      if (start === -1 || end <= start) throw new Error("no object");
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
    }
  }
  const list = (parsed as { groups?: unknown } | null)?.groups;
  if (!Array.isArray(list)) return { error: 'JSON에 "groups" 배열이 있어야 합니다.' };

  const byName = new Map(groups.map((g) => [keywordKey(g.groupName), g]));
  const answered = new Map<string, { keywords: string[]; reasons: Map<string, string> }>();
  let dropped = 0;
  for (const item of list) {
    const entry = item as { name?: unknown; keywords?: unknown; removed?: unknown };
    const key = typeof entry?.name === "string" ? keywordKey(entry.name) : "";
    if (!byName.has(key) || answered.has(key) || !Array.isArray(entry.keywords)) {
      dropped += 1;
      continue;
    }
    const reasons = new Map<string, string>();
    for (const r of Array.isArray(entry.removed) ? entry.removed : []) {
      const rr = r as { keyword?: unknown; reason?: unknown };
      if (typeof rr?.keyword === "string" && typeof rr.reason === "string" && rr.reason.trim()) reasons.set(keywordKey(rr.keyword), rr.reason.trim());
    }
    answered.set(key, { keywords: entry.keywords.filter((k): k is string => typeof k === "string"), reasons });
  }

  // 한 검색어는 한 그룹에만 — 이름이 그 검색어와 같은 그룹이 우선하고, 나머지는 먼저 나온 그룹이 가진다.
  const owner = new Map<string, string>();
  for (const g of groups) owner.set(keywordKey(g.groupName), keywordKey(g.groupName));

  const plans: KeywordGroupPlan[] = [];
  for (const g of groups) {
    const key = keywordKey(g.groupName);
    const answer = answered.get(key);
    if (!answer) continue;
    const original = unique(g.keywords);
    const originalKeys = new Set(original.map(keywordKey));

    const finalKeywords: string[] = [];
    for (const kw of unique([g.groupName, ...answer.keywords])) {
      const k = keywordKey(kw);
      const taken = owner.get(k);
      if (taken && taken !== key) {
        dropped += 1;
        continue;
      }
      if (finalKeywords.length >= MAX_KEYWORDS_PER_GROUP) {
        dropped += 1;
        continue;
      }
      owner.set(k, key);
      finalKeywords.push(kw.trim());
    }
    const finalKeys = new Set(finalKeywords.map(keywordKey));
    const kept = finalKeywords.filter((kw) => originalKeys.has(keywordKey(kw)));
    const added = finalKeywords.filter((kw) => !originalKeys.has(keywordKey(kw)));
    const removed = original.filter((kw) => !finalKeys.has(keywordKey(kw))).map((kw) => ({ keyword: kw, reason: answer.reasons.get(keywordKey(kw)) }));
    if (added.length === 0 && removed.length === 0) continue;
    plans.push({ groupName: g.groupName, kept, added, removed });
  }
  if (plans.length === 0) return { error: "정리할 항목이 없습니다 — AI가 바꿀 것을 찾지 못했거나 목록에 없는 그룹만 답했습니다." };
  return { plans, droppedCount: dropped };
}

/** 체크 결과 반영: 유지한 것 + 추가를 받아들인 것 + 제거를 되돌린 것(원래 순서 유지). 주제어 자신은 항상 남긴다. */
export function applyKeywordPlan(group: KeywordGroupInput, plan: KeywordGroupPlan, accepted: { added: Set<string>; restored: Set<string> }): string[] {
  const removedKeys = new Set(plan.removed.map((r) => keywordKey(r.keyword)));
  const addedKeys = new Set(plan.added.map(keywordKey));
  const result: string[] = [];
  for (const kw of unique(group.keywords)) {
    const k = keywordKey(kw);
    if (!removedKeys.has(k) || accepted.restored.has(k) || k === keywordKey(group.groupName)) result.push(kw);
  }
  for (const kw of plan.added) if (accepted.added.has(keywordKey(kw)) && addedKeys.has(keywordKey(kw))) result.push(kw);
  return unique(result);
}
