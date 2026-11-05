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
  private invalid = new Map<string, string>();

  constructor(private readonly maxAgeDays: number = 14) {}

  setSnapshot(snapshot: RangeSnapshot): void {
    this.snapshots.set(snapshot.sourceId, snapshot);
    this.invalid.delete(snapshot.sourceId);
  }

  /** 가져오기 실패·스키마 이탈 기록. 이전 성공 스냅샷은 낡음 판정을 위해 그대로 둔다. */
  setInvalid(sourceId: string, reason: string): void {
    this.invalid.set(sourceId, reason);
  }

  state(sourceId: string, nowMs: number): RangeState {
    const snap = this.snapshots.get(sourceId);
    if (this.invalid.has(sourceId) && !snap) return "invalid";
    if (!snap) return "missing";
    if (this.invalid.has(sourceId)) return "invalid";
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
