// User-Agent 토큰 매칭(명세 §6 ①). 브랜드 매칭에서 배운 교훈대로 단어 경계를 둔다.
// 토큰 앞뒤에 영숫자·밑줄·하이픈이 이어지면 다른 토큰의 일부로 보고 일치시키지 않는다.
//   "OAI-SearchBot"  ↔ "…; OAI-SearchBot/1.0"  일치
//   "OAI-SearchBot"  ↔ "xOAI-SearchBotz"        불일치
//   "Googlebot"      ↔ "Googlebot-Image/1.0"    불일치(다른 크롤러 → 수신함으로)
import type { BotEntry } from "./registry";

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
}

export function hasToken(ua: string, token: string): boolean {
  const haystack = ua.toLowerCase();
  const needle = token.toLowerCase();
  if (needle === "") return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) return true;
    from = at + 1;
  }
}

/** 겹치는 토큰이 여럿이면 더 긴(구체적인) 토큰을 우선한다. 같은 길이면 레지스트리 순서. */
export function matchBot(ua: string, entries: BotEntry[]): BotEntry | null {
  let best: BotEntry | null = null;
  for (const entry of entries) {
    if (!hasToken(ua, entry.uaToken)) continue;
    if (best === null || entry.uaToken.length > best.uaToken.length) best = entry;
  }
  return best;
}

const BOT_HINT = /(bot|crawl|spider|fetch|scrap|slurp|\+https?:\/\/)/i;

/** 레지스트리에 없지만 봇처럼 보이는 UA인가(수신함 후보). 일반 브라우저 UA는 보통 해당하지 않는다. */
export function looksLikeBot(ua: string): boolean {
  return BOT_HINT.test(ua);
}

/** 수신함 집계용 UA 정규화: 버전 숫자를 N으로, 공백 정리, 길이 상한. */
export function normalizeUaForInbox(ua: string): string {
  return ua.replace(/\d+(\.\d+)+/g, "N").replace(/\b\d+\b/g, "N").replace(/\s+/g, " ").trim().slice(0, 200);
}
