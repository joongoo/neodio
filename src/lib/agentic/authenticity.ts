// 진위 판정(명세 §6 ③). UA가 봇이라고 주장할 때 IP가 운영사 공개 범위 안인지 본다.
// 원칙: 모르는 것은 "의심"이 아니라 "검증 불가"로 둔다. "의심"은 믿을 만한 근거(신선한 목록 + 신뢰할 수 있는 IP)가 있을 때만.
import { parseIp, type ParsedIp } from "./cidr";
import type { RangeStore } from "./ranges";
import type { Registry, BotEntry } from "./registry";
import type { IpTrustStatus } from "./ipTrust";
import type { Authenticity, AuthenticityReason } from "./types";

export interface AuthContext {
  registry: Registry;
  ranges: RangeStore;
  nowMs: number;
  /** 기록된 IP를 믿어도 되는가. 사용자가 "직접 연결된 IP"라고 확인했다면 trusted로 넘길 수 있다. */
  ipTrust: IpTrustStatus;
}

export interface AuthResult {
  authenticity: Authenticity;
  reason: AuthenticityReason;
  matchedSourceId?: string;
  /** 같은 운영사의 다른 목적 목록에만 일치했는가(검증됨으로 취급하되 표시) */
  purposeMismatch?: boolean;
}

function unverifiable(reason: AuthenticityReason): AuthResult {
  return { authenticity: "unverifiable", reason };
}

export function judgeAuthenticity(entry: BotEntry, rawIp: string | undefined, ctx: AuthContext): AuthResult {
  if (entry.rangeSourceIds.length === 0) return unverifiable("no-range-source");
  if (ctx.ipTrust === "suspected-proxy") return unverifiable("proxy-ip-suspected");
  if (ctx.ipTrust === "no-ip") return unverifiable("no-ip");
  const ip: ParsedIp | null = rawIp ? parseIp(rawIp) : null;
  if (!ip) return unverifiable("no-ip");

  const states = entry.rangeSourceIds.map((id) => ({ id, state: ctx.ranges.state(id, ctx.nowMs) }));
  const usable = states.filter((s) => s.state === "ok");
  if (usable.length === 0) {
    if (states.some((s) => s.state === "invalid")) return unverifiable("ranges-schema-invalid");
    if (states.some((s) => s.state === "stale")) return unverifiable("ranges-stale");
    return unverifiable("ranges-missing");
  }

  // 이 봇의 목록 중 하나라도 IP를 포함하면 검증됨 — 일부 목록이 낡았어도 "포함"은 확실한 증거다
  for (const s of usable) {
    if (ctx.ranges.contains(s.id, ip)) return { authenticity: "verified", reason: "ok", matchedSourceId: s.id };
  }

  // 여기부터는 "포함되지 않음"으로 결론을 내려는 경로 → 목록이 전부 쓸 만할 때만 가능
  if (usable.length < states.length) return unverifiable("ranges-partial");

  // 같은 운영사의 다른 목적 목록에는 있는가(예: GPTBot UA인데 ChatGPT-User 대역)
  const operatorSources = ctx.registry.sourcesByOperator.get(entry.operator) ?? [];
  for (const id of operatorSources) {
    if (entry.rangeSourceIds.indexOf(id) >= 0) continue;
    if (ctx.ranges.state(id, ctx.nowMs) === "ok" && ctx.ranges.contains(id, ip)) {
      return { authenticity: "verified", reason: "purpose-mismatch", matchedSourceId: id, purposeMismatch: true };
    }
  }

  // 로그가 작아 IP가 진짜 클라이언트 IP인지 모르는 상태에서는 "범위 밖"을 의심 근거로 쓰지 않는다
  if (ctx.ipTrust === "insufficient-sample") return unverifiable("ip-trust-unknown");
  return { authenticity: "suspicious", reason: "ip-outside-ranges" };
}

/** UA를 모를 때 IP만으로 운영사를 역추적한다("운영사 IP인데 모르는 UA" → 신규 봇 발견 단서). */
export function operatorOfIp(rawIp: string | undefined, ctx: AuthContext): string | null {
  if (!rawIp || ctx.ipTrust === "suspected-proxy" || ctx.ipTrust === "no-ip") return null;
  const ip = parseIp(rawIp);
  if (!ip) return null;
  for (const [operator, sourceIds] of ctx.registry.sourcesByOperator) {
    for (const id of sourceIds) {
      if (ctx.ranges.state(id, ctx.nowMs) === "ok" && ctx.ranges.contains(id, ip)) return operator;
    }
  }
  return null;
}
