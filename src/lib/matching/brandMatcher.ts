// 브랜드 매칭 엔진 v2 (순수 함수, UI·DB 없음). 기존 backend/processing/text.ts는 건드리지 않는다.
// 설계: docs/oss-research/03-geo-visibility-lab/05_INDEPENDENT_DESIGN.md D7.
//  - 입력을 NFKC로 정규화하고 소문자로 접되, 모든 일치는 원문 오프셋으로 돌려준다.
//  - 별칭을 문자 체계(한글/라틴/한자·가나/혼합)로 나눠 경계 규칙을 적용한다.
//  - 인용 칩("Neodigm +1")과 도메인 표기("associative.in")처럼 본문 언급이 아닌 일치는 제외하되, 제외 사유를 남긴다.

export const MATCHER_RULE_VERSION = "brand-matcher/2";

export type AliasScript = "hangul" | "latin" | "cjk" | "mixed";
export type MatchRuleId = "plain" | "latin-boundary" | "hangul-particle" | "cjk-partial";
export type ExcludeReason = "citation-chip" | "domain-like" | "latin-boundary" | "hangul-compound";

export interface MatchOptions {
  /** 한글 별칭 바로 뒤가 조사 목록 밖의 한글이면(복합어) 제외. 기본 false(기존 부분 일치 동작 유지) */
  hangulTrailing?: "any" | "particle";
  /** 길이가 이 값 이하인 라틴 별칭은 대소문자가 같은 일치만 인정. 기본 사용 안 함 */
  shortLatinExactCase?: { maxLen: number };
  /** 인용 칩·도메인 표기 제외. 기본 true */
  excludeNonProse?: boolean;
  /** 스니펫 좌우 길이 */
  snippetRadius?: number;
}

export interface MatchSpan {
  alias: string;
  /** 원문(입력 text) 기준 오프셋, [start, end) */
  start: number;
  end: number;
  rule: MatchRuleId;
  snippet: string;
}

export interface ExcludedSpan extends MatchSpan {
  reason: ExcludeReason;
}

export interface MatchResult {
  ruleVersion: string;
  spans: MatchSpan[];
  excluded: ExcludedSpan[];
}

/** 조사 목록(기존 규칙 확장). 긴 것을 앞에 둔다. */
export const HANGUL_PARTICLES = ["으로", "에서", "에게", "까지", "부터", "은", "는", "이", "가", "을", "를", "의", "과", "와", "로", "에", "도", "만"];

interface Norm {
  text: string;
  /** norm[i] → 원문 오프셋 */
  map: number[];
  /** 원문 길이 */
  length: number;
}

function foldChar(ch: string): string {
  return ch.normalize("NFKC").toLocaleLowerCase("ko-KR");
}

/** 호환 문자 통일·대소문자 접기·연속 공백 축소. 오프셋 지도를 함께 만든다(trim은 하지 않는다). */
export function normalizeWithMap(text: string): Norm {
  let out = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    const folded = foldChar(ch);
    for (const f of folded) {
      if (/\s/.test(f)) {
        if (prevSpace) continue;
        out += " ";
        map.push(i);
        prevSpace = true;
      } else {
        out += f;
        map.push(i);
        prevSpace = false;
      }
    }
    i += width;
  }
  return { text: out, map, length: text.length };
}

const isLatinWord = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);
const isHangul = (c: string | undefined) => !!c && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c);
const isCjk = (c: string | undefined) => !!c && /[぀-ヿ㐀-䶿一-鿿]/.test(c);

export function classifyAlias(alias: string): AliasScript {
  let h = false, l = false, c = false;
  for (const ch of alias.normalize("NFKC").toLocaleLowerCase("ko-KR")) {
    if (isHangul(ch)) h = true;
    else if (/[a-z0-9]/.test(ch)) l = true;
    else if (isCjk(ch)) c = true;
  }
  const kinds = [h, l, c].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (h) return "hangul";
  if (c) return "cjk";
  return "latin";
}

const isDomainAlias = (alias: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(alias.trim());

function startsWithParticle(rest: string): boolean {
  return HANGUL_PARTICLES.some((p) => rest.startsWith(p));
}

/** 인용 칩: 일치 바로 뒤가 " +숫자"이고 그 뒤가 공백·끝·줄바꿈. */
function isCitationChip(norm: string, end: number): boolean {
  return /^ ?\+\d{1,3}(?=\s|$)/.test(norm.slice(end, end + 8));
}

/** 도메인 표기: "associative.in", "www.brand", "https://brand" 처럼 호스트 이름의 일부로 쓰인 경우. */
function isDomainLike(norm: string, start: number, end: number): boolean {
  const after = norm.slice(end, end + 12);
  if (/^\.[a-z]{2,}(?![a-z])/.test(after)) return true; // 일치 뒤에 .tld
  const before = norm.slice(Math.max(0, start - 10), start);
  if (/(?:https?:\/\/|www\.)$/.test(before)) return true; // 일치 앞이 스킴·www
  return false;
}

function snippetOf(text: string, start: number, end: number, radius: number): string {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  return text.slice(s, e).replace(/\s+/g, " ").trim();
}

function ruleFor(script: AliasScript): MatchRuleId {
  switch (script) {
    case "latin": return "latin-boundary";
    case "hangul": return "hangul-particle";
    case "cjk": return "cjk-partial";
    default: return "plain";
  }
}

/** 한 별칭 목록의 모든 일치를 찾는다. 같은 위치는 긴 별칭이 이긴다. */
export function matchAliases(text: string, aliases: string[], options: MatchOptions = {}): MatchResult {
  const opt = { hangulTrailing: "any" as const, excludeNonProse: true, snippetRadius: 40, ...options };
  const n = normalizeWithMap(text);
  const spans: MatchSpan[] = [];
  const excluded: ExcludedSpan[] = [];

  const sorted = Array.from(new Set(aliases.map((a) => a.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);

  const claimed: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => claimed.some(([a, b]) => s < b && e > a);

  for (const alias of sorted) {
    const needle = n.text.length === 0 ? "" : normalizeWithMap(alias).text.trim();
    if (!needle) continue;
    const script = classifyAlias(alias);
    const domain = isDomainAlias(alias);
    let from = 0;
    while (from <= n.text.length - needle.length) {
      const at = n.text.indexOf(needle, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + needle.length;
      const origStart = n.map[at];
      const origEnd = end < n.map.length ? n.map[end] : n.length;
      if (overlaps(origStart, origEnd)) continue;

      const before = n.text[at - 1];
      const after = n.text[end];
      const mk = (rule: MatchRuleId): MatchSpan => ({ alias, start: origStart, end: origEnd, rule, snippet: snippetOf(text, origStart, origEnd, opt.snippetRadius) });
      const drop = (rule: MatchRuleId, reason: ExcludeReason) => excluded.push({ ...mk(rule), reason });
      const rule = ruleFor(script);

      // 경계 규칙: 가장자리 문자 유형 기준
      const firstIsLatin = isLatinWord(needle[0]);
      const lastIsLatin = isLatinWord(needle[needle.length - 1]);
      if ((firstIsLatin && isLatinWord(before)) || (lastIsLatin && isLatinWord(after))) {
        drop(rule, "latin-boundary");
        continue;
      }
      if (script === "hangul" && opt.hangulTrailing === "particle" && isHangul(after) && !startsWithParticle(n.text.slice(end))) {
        drop(rule, "hangul-compound");
        continue;
      }
      if (script === "latin" && !domain && opt.shortLatinExactCase && needle.length <= opt.shortLatinExactCase.maxLen) {
        if (text.slice(origStart, origEnd) !== alias.trim()) {
          drop(rule, "latin-boundary");
          continue;
        }
      }
      if (opt.excludeNonProse) {
        if (isCitationChip(n.text, end)) { drop(rule, "citation-chip"); continue; }
        if (!domain && isDomainLike(n.text, at, end)) { drop(rule, "domain-like"); continue; }
      }
      spans.push(mk(rule));
      claimed.push([origStart, origEnd]);
    }
  }
  spans.sort((a, b) => a.start - b.start);
  excluded.sort((a, b) => a.start - b.start);
  return { ruleVersion: MATCHER_RULE_VERSION, spans, excluded };
}

/** 브랜드 한 곳에 대한 언급 여부와 첫 위치. 기존 findBrandMentions의 index와 같은 용도(원문 오프셋 기준). */
export function firstMention(text: string, aliases: string[], options?: MatchOptions): MatchSpan | null {
  return matchAliases(text, aliases, options).spans[0] ?? null;
}

export interface ShadowDiff {
  /** 새 규칙에서만 일치 */
  gained: string[];
  /** 새 규칙에서 사라진 일치 */
  lost: string[];
  unchanged: number;
}

/** 두 규칙(옵션)으로 같은 입력 묶음을 돌려 일치 차이를 낸다. 키는 `${id}@${start}-${end}:${alias}`. */
export function shadowCompare(items: Array<{ id: string; text: string; aliases: string[] }>, a: MatchOptions, b: MatchOptions): ShadowDiff {
  const keys = (opt: MatchOptions) => {
    const set = new Set<string>();
    for (const it of items) for (const s of matchAliases(it.text, it.aliases, opt).spans) set.add(`${it.id}@${s.start}-${s.end}:${s.alias}`);
    return set;
  };
  const ka = keys(a), kb = keys(b);
  const gained: string[] = [], lost: string[] = [];
  let unchanged = 0;
  kb.forEach((k) => (ka.has(k) ? unchanged++ : gained.push(k)));
  ka.forEach((k) => { if (!kb.has(k)) lost.push(k); });
  return { gained: gained.sort(), lost: lost.sort(), unchanged };
}
