// 분류기(명세 §6): 이벤트 하나 → 운영사·목적·진위 또는 수신함 후보.
import { judgeAuthenticity, operatorOfIp, type AuthContext } from "./authenticity";
import { looksLikeBot, matchBot, normalizeUaForInbox } from "./uaMatch";
import type { Authenticity, AuthenticityReason, NormalizedEvent, Purpose } from "./types";

export type ClassKind =
  | "known-bot" // 레지스트리의 봇 UA와 일치
  | "bot-candidate" // 봇처럼 보이지만 레지스트리에 없음 → 수신함
  | "operator-ip-unknown-ua" // 운영사 공개 IP에서 왔지만 UA를 모름 → 수신함(우선 후보)
  | "regular"; // 일반 트래픽

export interface Classification {
  kind: ClassKind;
  botId?: string;
  operator?: string;
  uaToken?: string;
  purpose?: Purpose;
  authenticity?: Authenticity;
  authReason?: AuthenticityReason;
  matchedSourceId?: string;
  purposeMismatch?: boolean;
  /** 수신함 집계 키(UA 정규화 문자열). kind가 수신함 계열일 때만 */
  inboxKey?: string;
}

export function classifyEvent(event: Pick<NormalizedEvent, "ua" | "ip">, ctx: AuthContext): Classification {
  const entry = matchBot(event.ua, ctx.registry.entries);
  if (entry) {
    const auth = judgeAuthenticity(entry, event.ip, ctx);
    return {
      kind: "known-bot",
      botId: entry.id,
      operator: entry.operator,
      uaToken: entry.uaToken,
      purpose: entry.purpose,
      authenticity: auth.authenticity,
      authReason: auth.reason,
      matchedSourceId: auth.matchedSourceId,
      purposeMismatch: auth.purposeMismatch,
    };
  }

  // UA는 모르지만 IP가 운영사 공개 범위 → 신규 봇(또는 브라우저형 에이전트) 발견 단서
  const operator = operatorOfIp(event.ip, ctx);
  if (operator) return { kind: "operator-ip-unknown-ua", operator, inboxKey: normalizeUaForInbox(event.ua) };

  if (looksLikeBot(event.ua)) return { kind: "bot-candidate", inboxKey: normalizeUaForInbox(event.ua) };
  return { kind: "regular" };
}
