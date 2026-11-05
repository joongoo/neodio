// 시험 전용 도우미(운영 코드에서 쓰지 않는다). 네트워크 호출 없이 합성 IP 목록으로 컨텍스트를 만든다.
// 예시 IP: 132.196.86.0/24는 OpenAI가 공개한 GPTBot 범위의 첫 항목(2026-11-05 조사), 203.0.113.0/24·198.51.100.0/24·2001:db8::/32는 문서용 예약 주소.
import type { AuthContext } from "./authenticity";
import type { IpTrustStatus } from "./ipTrust";
import { parseRangeSnapshot, RangeStore } from "./ranges";
import { createRegistry } from "./registry";

export const NOW_MS = Date.UTC(2026, 10, 5, 3, 0, 0);
export const FRESH_CREATION = "2026-11-04T15:45:59.000000";
export const STALE_CREATION = "2026-10-01T00:00:00.000000";

export function rangeJson(prefixes: string[], creationTime: string = FRESH_CREATION): unknown {
  return {
    creationTime,
    prefixes: prefixes.map((p) => (p.indexOf(":") >= 0 ? { ipv6Prefix: p } : { ipv4Prefix: p })),
  };
}

export function loadRanges(store: RangeStore, sourceId: string, prefixes: string[], creationTime?: string): void {
  const parsed = parseRangeSnapshot(rangeJson(prefixes, creationTime), sourceId, NOW_MS);
  if (!parsed.ok) throw new Error(`테스트 목록이 무효입니다: ${sourceId} ${parsed.reason}`);
  store.setSnapshot(parsed.snapshot);
}

/** 기본: 모든 주요 목록을 신선한 합성 범위로 채운 컨텍스트 */
export function makeCtx(options: { ipTrust?: IpTrustStatus; skip?: string[]; stale?: string[] } = {}): AuthContext {
  const store = new RangeStore(14);
  const lists: Record<string, string[]> = {
    "openai-gptbot": ["132.196.86.0/24", "172.182.202.0/25"],
    "openai-searchbot": ["198.51.100.0/24"],
    "openai-chatgpt-user": ["203.0.113.0/24"],
    "openai-adsbot": ["192.0.2.0/24"],
    "anthropic-bots": ["216.73.216.0/22", "34.162.230.222/32"],
    "perplexity-bot": ["107.20.236.150/32"],
    "perplexity-user": ["18.97.1.228/32"],
    "google-googlebot": ["66.249.64.0/27", "2001:4860:4801:10::/64"],
    "google-common-crawlers": ["66.249.64.0/27"],
    "google-special-crawlers": ["66.249.90.0/27"],
    "google-user-triggered-google": ["66.249.91.0/27"],
    "google-user-triggered": ["66.249.92.0/27"],
  };
  for (const [id, prefixes] of Object.entries(lists)) {
    if (options.skip?.indexOf(id) !== undefined && options.skip.indexOf(id) >= 0) continue;
    loadRanges(store, id, prefixes, options.stale?.indexOf(id) !== undefined && options.stale.indexOf(id) >= 0 ? STALE_CREATION : undefined);
  }
  return { registry: createRegistry(), ranges: store, nowMs: NOW_MS, ipTrust: options.ipTrust ?? "trusted" };
}

export const UA = {
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)",
  chatgptUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  oaiSearch: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
  claudeBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  claudeUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0)",
  claudeSearch: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0)",
  perplexity: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  perplexityUser: "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  yeti: "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)",
};
