// 운영사가 공개하는 IP 범위 JSON의 검증·보관(명세 §7.2~7.3).
// 확인한 구조(2026-11-05): { creationTime, prefixes: [ { ipv4Prefix } | { ipv6Prefix } ] }
// 이 구조에서 벗어나면 조용히 받아들이지 않고 "스키마 무효"로 격하한다 → 진위 판정은 "검증 불가".
import { PrefixSet, parsePrefix, type ParsedIp } from "./cidr";

export interface RangeSnapshot {
  sourceId: string;
  /** 파일이 스스로 밝힌 생성 시각(UTC ms). 없거나 해석 불가면 null */
  creationTimeMs: number | null;
  /** 이 스냅샷을 받은 시각(UTC ms) */
  fetchedAtMs: number;
  counts: { v4: number; v6: number };
  set: PrefixSet;
}

export type RangeParseResult =
  | { ok: true; snapshot: RangeSnapshot }
  | { ok: false; reason: "not-object" | "no-prefixes" | "empty" | "bad-entry"; detail?: string };

/** "2026-11-04T15:45:59.000000"처럼 시간대 없는 값은 UTC로 본다. */
function parseCreationTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/(\.\d{3})\d+/, "$1");
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : ms;
}

export function parseRangeSnapshot(json: unknown, sourceId: string, fetchedAtMs: number): RangeParseResult {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, reason: "not-object" };
  const obj = json as Record<string, unknown>;
  const prefixes = obj.prefixes;
  if (!Array.isArray(prefixes)) return { ok: false, reason: "no-prefixes" };
  // 빈 목록을 받아들이면 모든 요청이 "범위 밖(의심)"이 되므로 무효 처리한다
  if (prefixes.length === 0) return { ok: false, reason: "empty" };
  const set = new PrefixSet();
  for (let i = 0; i < prefixes.length; i++) {
    const entry = prefixes[i] as Record<string, unknown> | null;
    const text =
      entry && typeof entry === "object" ? (typeof entry.ipv4Prefix === "string" ? entry.ipv4Prefix : typeof entry.ipv6Prefix === "string" ? entry.ipv6Prefix : null) : null;
    const prefix = text === null ? null : parsePrefix(text);
    if (!prefix) return { ok: false, reason: "bad-entry", detail: `index ${i}` };
    // ipv4Prefix 키에 IPv6가 들어오는 등 키와 내용이 어긋나면 스키마 이탈로 본다
    const expectedFamily = typeof entry!.ipv4Prefix === "string" ? 4 : 6;
    if (prefix.family !== expectedFamily) return { ok: false, reason: "bad-entry", detail: `index ${i}: key/family mismatch` };
    set.add(prefix);
  }
  return {
    ok: true,
    snapshot: { sourceId, creationTimeMs: parseCreationTime(obj.creationTime), fetchedAtMs, counts: set.counts, set },
  };
}

export type RangeState = "ok" | "missing" | "invalid" | "stale";

/** 출처별 스냅샷 보관소. 진위 판정은 반드시 이 상태를 먼저 본다. */
export class RangeStore {
  private snapshots = new Map<string, RangeSnapshot>();
  /** 스키마 이탈로 받은 내용을 믿을 수 없는 출처 → 상태 "invalid"(이전 스냅샷도 쓰지 않는다) */
  private invalid = new Map<string, string>();
  /** 일시적 가져오기 실패(네트워크·HTTP 오류) → 상태에 영향 없음. 마지막 성공 스냅샷은 낡을 때까지 계속 쓴다 */
  private fetchFailures = new Map<string, { reason: string; atMs: number }>();

  constructor(private readonly maxAgeDays: number = 14) {}

  setSnapshot(snapshot: RangeSnapshot): void {
    this.snapshots.set(snapshot.sourceId, snapshot);
    this.invalid.delete(snapshot.sourceId);
    this.fetchFailures.delete(snapshot.sourceId);
  }

  /**
   * 받은 내용이 기대한 스키마가 아니다(스키마 이탈·빈 목록 등). 내용을 믿을 수 없으므로
   * 이전 성공 스냅샷이 있어도 "invalid"로 격하한다 → 진위 판정은 "검증 불가".
   */
  setInvalid(sourceId: string, reason: string): void {
    this.invalid.set(sourceId, reason);
  }

  /**
   * 목록을 가져오지 못했다(네트워크·HTTP 오류). 내용에 문제가 있는 것이 아니므로 상태를 바꾸지 않는다:
   * 마지막 성공 스냅샷은 최대 나이(기본 14일)를 넘기 전까지 계속 쓰이고, 그 뒤에는 "stale"이 된다.
   * 호출자는 lastFetchFailure로 운영 알림을 낼 수 있다.
   */
  setFetchFailed(sourceId: string, reason: string, atMs: number): void {
    this.fetchFailures.set(sourceId, { reason, atMs });
  }

  lastFetchFailure(sourceId: string): { reason: string; atMs: number } | undefined {
    return this.fetchFailures.get(sourceId);
  }

  state(sourceId: string, nowMs: number): RangeState {
    if (this.invalid.has(sourceId)) return "invalid";
    const snap = this.snapshots.get(sourceId);
    if (!snap) return "missing";
    // 목록이 스스로 밝힌 시각이 있으면 그것을, 없으면 받은 시각을 나이의 기준으로 쓴다
    const basis = snap.creationTimeMs ?? snap.fetchedAtMs;
    const ageDays = (nowMs - basis) / 86_400_000;
    return ageDays > this.maxAgeDays ? "stale" : "ok";
  }

  contains(sourceId: string, ip: ParsedIp): boolean {
    return this.snapshots.get(sourceId)?.set.contains(ip) ?? false;
  }

  get(sourceId: string): RangeSnapshot | undefined {
    return this.snapshots.get(sourceId);
  }
}
