// 비교 가능성 키 (D9) — 순수 함수. 추세를 이어 그려도 되는 구간인지 판정하고, 끊어야 할 주를 알려 준다.
// 설계: docs/oss-research/03-geo-visibility-lab/05_INDEPENDENT_DESIGN.md D9 요구사항 R1~R3.
//  - 키 구성: (프롬프트 내용 해시, 엔진, 마켓, 수집 방식 버전, 분석 규칙 버전)
//  - 필수 일치: 프롬프트·엔진·마켓. 경고만: 수집 방식 버전, 분석 규칙 버전.
//  - 데이터를 지우지 않는다. 단절 지점만 표시한다.

export interface ComparabilityKey {
  promptHash: string;
  engine: string;
  market: string;
  collectorVersion: string;
  ruleVersion: string;
}

export type KeyPart = keyof ComparabilityKey;

export const REQUIRED_PARTS: KeyPart[] = ["promptHash", "engine", "market"];
export const WARN_PARTS: KeyPart[] = ["collectorVersion", "ruleVersion"];

/** 공백·대소문자 차이는 같은 질문으로 본다. 53비트 해시(cyrb53) — 충돌이 중요하지 않은 비교용. */
export function hashPrompt(text: string): string {
  const s = text.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").trim();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function makeKey(input: { promptText: string; engine: string; market: string; collectorVersion?: string; ruleVersion?: string }): ComparabilityKey {
  return {
    promptHash: hashPrompt(input.promptText),
    engine: input.engine,
    market: input.market,
    collectorVersion: input.collectorVersion ?? "unknown",
    ruleVersion: input.ruleVersion ?? "unknown",
  };
}

export function changedParts(a: ComparabilityKey, b: ComparabilityKey): KeyPart[] {
  return (Object.keys(a) as KeyPart[]).filter((p) => a[p] !== b[p]);
}

/** 한 주에 한 프롬프트(슬롯)가 사용한 키. slot = 프롬프트 id처럼 주를 넘어 같은 대상을 가리키는 식별자. */
export interface WeekSlot {
  slot: string;
  key: ComparabilityKey;
}

export interface WeekInput {
  week: string;
  slots: WeekSlot[];
}

export interface WeekComparison {
  week: string;
  /** 직전 주와 비교한 슬롯 수(두 주 모두에 있는 슬롯) */
  compared: number;
  /** 필수 부분이 바뀐 슬롯 수 */
  requiredChanged: number;
  /** 경고 부분만 바뀐 슬롯 수 */
  warnChanged: number;
  /** 부분별 바뀐 슬롯 수 */
  byPart: Record<KeyPart, number>;
  /** 직전 주에 없던 슬롯 / 사라진 슬롯 (구성 변화) */
  added: number;
  removed: number;
  /** requiredChanged / compared */
  requiredShare: number;
  /** shifted = 질문 구성이 크게 바뀜(수집 대상 묶음이 달라짐). 측정 방식 변경은 아니지만 같은 질문끼리의 비교는 아니다. */
  status: "first" | "comparable" | "warn" | "shifted" | "break" | "insufficient";
  note: string;
}

export interface ComparabilityOptions {
  /** 필수 부분이 바뀐 슬롯 비율이 이 값 이상이면 단절. 기본 0.2 */
  breakShare?: number;
  /** 경고 부분만 바뀐 슬롯 비율이 이 값 이상이면 경고. 기본 0.2 */
  warnShare?: number;
  /** 비교한 슬롯이 이보다 적으면 판정하지 않는다. 기본 5 */
  minCompared?: number;
  /** 두 주의 질문 합집합 중 추가·제거된 비율이 이 값 이상이면 구성 변동(shifted). 기본 0.5 */
  compositionShare?: number;
}

const zeroParts = (): Record<KeyPart, number> => ({ promptHash: 0, engine: 0, market: 0, collectorVersion: 0, ruleVersion: 0 });

/** 주 배열(오래된 순)을 직전 주와 비교한다. 주 안에서 같은 슬롯이 여러 키를 쓰면 첫 키를 대표로 본다. */
export function compareWeeks(weeks: WeekInput[], options: ComparabilityOptions = {}): WeekComparison[] {
  const breakShare = options.breakShare ?? 0.2;
  const warnShare = options.warnShare ?? 0.2;
  const minCompared = options.minCompared ?? 5;
  const compositionShare = options.compositionShare ?? 0.5;
  const slotMap = (w: WeekInput) => {
    const m = new Map<string, ComparabilityKey>();
    for (const s of w.slots) if (!m.has(s.slot)) m.set(s.slot, s.key);
    return m;
  };
  return weeks.map((w, i): WeekComparison => {
    if (i === 0) return { week: w.week, compared: 0, requiredChanged: 0, warnChanged: 0, byPart: zeroParts(), added: 0, removed: 0, requiredShare: 0, status: "first", note: "첫 주" };
    const prev = slotMap(weeks[i - 1]);
    const cur = slotMap(w);
    const byPart = zeroParts();
    let compared = 0, requiredChanged = 0, warnChanged = 0, added = 0, removed = 0;
    cur.forEach((key, slot) => {
      const before = prev.get(slot);
      if (!before) { added++; return; }
      compared++;
      const parts = changedParts(before, key);
      parts.forEach((p) => byPart[p]++);
      if (parts.some((p) => REQUIRED_PARTS.includes(p))) requiredChanged++;
      else if (parts.length > 0) warnChanged++;
    });
    prev.forEach((_, slot) => { if (!cur.has(slot)) removed++; });
    const requiredShare = compared ? requiredChanged / compared : 0;
    const warnOnlyShare = compared ? warnChanged / compared : 0;
    let status: WeekComparison["status"];
    let note: string;
    const union = compared + added + removed;
    const churn = union ? (added + removed) / union : 0;
    if (requiredShare >= breakShare && compared >= minCompared) {
      status = "break";
      note = `질문·엔진·마켓이 바뀐 항목이 ${requiredChanged}/${compared}개(${Math.round(requiredShare * 100)}%)라 직전 주와 이어서 비교하기 어려워요.`;
    } else if (union >= minCompared && churn >= compositionShare) {
      status = "shifted";
      note = `질문 구성이 크게 달라졌어요(추가 ${added}개, 제거 ${removed}개, 유지 ${compared}개). 같은 질문끼리의 비교가 아니에요.`;
    } else if (compared < minCompared) {
      status = "insufficient";
      note = `직전 주와 겹치는 질문이 ${compared}개뿐이라 연속성을 판단하기 어려워요.`;
    } else if (warnOnlyShare >= warnShare) {
      status = "warn";
      note = `수집 방식 또는 분석 규칙이 바뀐 항목이 ${warnChanged}/${compared}개(${Math.round(warnOnlyShare * 100)}%)예요. 비교할 수 있지만 변화 일부는 측정 방식 때문일 수 있어요.`;
    } else {
      status = "comparable";
      note = requiredChanged + warnChanged > 0 ? `일부 항목(${requiredChanged + warnChanged}/${compared}개)만 바뀌어 이어서 비교할 수 있어요.` : "직전 주와 같은 조건이에요.";
    }
    return { week: w.week, compared, requiredChanged, warnChanged, byPart, added, removed, requiredShare, status, note };
  });
}

/** 추세선을 끊어 그릴 주(단절 직전 주와의 연결을 끊는다). */
export function breakWeeks(comparisons: WeekComparison[]): string[] {
  return comparisons.filter((c) => c.status === "break").map((c) => c.week);
}

/** 구간 나누기: 단절 주마다 새 구간을 시작한다. 같은 구간 안의 주만 이어서 비교해도 된다. */
export function comparableSegments(comparisons: WeekComparison[]): string[][] {
  const out: string[][] = [];
  for (const c of comparisons) {
    if (c.status === "break" || out.length === 0) out.push([c.week]);
    else out[out.length - 1].push(c.week);
  }
  return out;
}
