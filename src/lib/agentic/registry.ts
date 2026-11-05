// 봇 레지스트리(명세 §7.1). 코드가 아니라 "버전 관리되는 데이터"로 다룬다 — 출처와 확인 일자를 항상 함께 둔다.
// 이 목록은 2026-11-05 공식 문서 조사 시점의 스냅샷이다. 변경되면 REGISTRY_VERSION을 올린다.
import type { Purpose } from "./types";

export const REGISTRY_VERSION = "2026-11-05.1";

export type ObeysRobots = "yes" | "no" | "partial" | "unknown";

export interface RangeSource {
  id: string;
  operator: string;
  /** 확인한 URL. 문서에는 파일 이름만 나와 있고 경로를 직접 확인하지 못했으면 null */
  url: string | null;
  urlVerified: boolean;
  note?: string;
}

export interface BotEntry {
  id: string;
  operator: string;
  /** UA에서 찾을 토큰(단어 경계 규칙으로 매칭) */
  uaToken: string;
  purpose: Purpose;
  obeysRobots: ObeysRobots;
  /** 이 봇의 진위를 확인할 수 있는 공개 IP 목록. 비어 있으면 검증 불가 */
  rangeSourceIds: string[];
  sourceDocUrl: string;
  checkedAt: string;
  /** 토큰이나 분류에 대한 확신. low는 공식 자료로 직접 확인하지 못한 항목 */
  confidence: "high" | "low";
  notes?: string;
}

const CHECKED = "2026-11-05";

export const RANGE_SOURCES: RangeSource[] = [
  { id: "openai-gptbot", operator: "OpenAI", url: "https://openai.com/gptbot.json", urlVerified: true },
  { id: "openai-searchbot", operator: "OpenAI", url: "https://openai.com/searchbot.json", urlVerified: false, note: "공식 문서에 URL 명시, 내용은 직접 받아 보지 않음" },
  { id: "openai-chatgpt-user", operator: "OpenAI", url: "https://openai.com/chatgpt-user.json", urlVerified: false, note: "공식 문서에 URL 명시, 내용은 직접 받아 보지 않음" },
  { id: "openai-adsbot", operator: "OpenAI", url: "https://openai.com/adsbot.json", urlVerified: false, note: "공식 문서에 URL 명시, 내용은 직접 받아 보지 않음" },
  { id: "anthropic-bots", operator: "Anthropic", url: "https://claude.com/crawling/bots.json", urlVerified: true, note: "봇별 구분 없는 단일 목록 — IP로는 '운영사 소유 주소인가'만 알 수 있다" },
  { id: "perplexity-bot", operator: "Perplexity", url: "https://www.perplexity.ai/perplexitybot.json", urlVerified: true },
  { id: "perplexity-user", operator: "Perplexity", url: "https://www.perplexity.ai/perplexity-user.json", urlVerified: false, note: "공식 문서에 URL 명시, 내용은 직접 받아 보지 않음" },
  { id: "google-googlebot", operator: "Google", url: "https://developers.google.com/static/search/apis/ipranges/googlebot.json", urlVerified: true },
  { id: "google-common-crawlers", operator: "Google", url: null, urlVerified: false, note: "파일 이름(common-crawlers.json)만 문서에서 확인, 경로 미확인" },
  { id: "google-special-crawlers", operator: "Google", url: null, urlVerified: false, note: "파일 이름(special-crawlers.json)만 문서에서 확인, 경로 미확인" },
  { id: "google-user-triggered-google", operator: "Google", url: null, urlVerified: false, note: "파일 이름(user-triggered-fetchers-google.json)만 확인" },
  { id: "google-user-triggered", operator: "Google", url: null, urlVerified: false, note: "파일 이름(user-triggered-fetchers.json)만 확인" },
];

const DOC = {
  openai: "https://developers.openai.com/api/docs/bots",
  anthropic: "https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  perplexity: "https://docs.perplexity.ai/guides/bots",
  google: "https://developers.google.com/crawling/docs/crawlers-fetchers/overview",
  naver: "https://daleseo.com/robots-txt/",
};

export const BOT_ENTRIES: BotEntry[] = [
  { id: "openai-gptbot", operator: "OpenAI", uaToken: "GPTBot", purpose: "training", obeysRobots: "yes", rangeSourceIds: ["openai-gptbot"], sourceDocUrl: DOC.openai, checkedAt: CHECKED, confidence: "high" },
  { id: "openai-searchbot", operator: "OpenAI", uaToken: "OAI-SearchBot", purpose: "search-index", obeysRobots: "yes", rangeSourceIds: ["openai-searchbot"], sourceDocUrl: DOC.openai, checkedAt: CHECKED, confidence: "high" },
  { id: "openai-chatgpt-user", operator: "OpenAI", uaToken: "ChatGPT-User", purpose: "user-fetch", obeysRobots: "no", rangeSourceIds: ["openai-chatgpt-user"], sourceDocUrl: DOC.openai, checkedAt: CHECKED, confidence: "high", notes: "사용자 요청으로 시작되므로 robots.txt가 적용되지 않을 수 있다고 문서가 설명" },
  { id: "openai-adsbot", operator: "OpenAI", uaToken: "OAI-AdsBot", purpose: "ads-check", obeysRobots: "unknown", rangeSourceIds: ["openai-adsbot"], sourceDocUrl: DOC.openai, checkedAt: CHECKED, confidence: "high" },

  { id: "anthropic-claudebot", operator: "Anthropic", uaToken: "ClaudeBot", purpose: "training", obeysRobots: "yes", rangeSourceIds: ["anthropic-bots"], sourceDocUrl: DOC.anthropic, checkedAt: CHECKED, confidence: "high" },
  { id: "anthropic-searchbot", operator: "Anthropic", uaToken: "Claude-SearchBot", purpose: "search-index", obeysRobots: "yes", rangeSourceIds: ["anthropic-bots"], sourceDocUrl: DOC.anthropic, checkedAt: CHECKED, confidence: "high" },
  { id: "anthropic-user", operator: "Anthropic", uaToken: "Claude-User", purpose: "user-fetch", obeysRobots: "yes", rangeSourceIds: ["anthropic-bots"], sourceDocUrl: DOC.anthropic, checkedAt: CHECKED, confidence: "high" },

  { id: "perplexity-bot", operator: "Perplexity", uaToken: "PerplexityBot", purpose: "search-index", obeysRobots: "unknown", rangeSourceIds: ["perplexity-bot"], sourceDocUrl: DOC.perplexity, checkedAt: CHECKED, confidence: "high" },
  { id: "perplexity-user", operator: "Perplexity", uaToken: "Perplexity-User", purpose: "user-fetch", obeysRobots: "no", rangeSourceIds: ["perplexity-user"], sourceDocUrl: DOC.perplexity, checkedAt: CHECKED, confidence: "high", notes: "문서: robots.txt는 대체로 무시(사용자 요청이므로)" },

  { id: "google-googlebot", operator: "Google", uaToken: "Googlebot", purpose: "search-index", obeysRobots: "yes", rangeSourceIds: ["google-googlebot", "google-common-crawlers"], sourceDocUrl: DOC.google, checkedAt: CHECKED, confidence: "high", notes: "Googlebot-Image 등 하이픈이 붙은 변형은 다른 토큰이라 이 항목과 매칭되지 않고 수신함으로 간다" },
  { id: "google-adsbot", operator: "Google", uaToken: "AdsBot-Google", purpose: "ads-check", obeysRobots: "partial", rangeSourceIds: ["google-special-crawlers"], sourceDocUrl: DOC.google, checkedAt: CHECKED, confidence: "high", notes: "문서: 특수 크롤러는 광고 게시자 허가로 전역(*) robots 규칙을 무시할 수 있음" },

  { id: "naver-yeti", operator: "Naver", uaToken: "Yeti", purpose: "search-index", obeysRobots: "unknown", rangeSourceIds: [], sourceDocUrl: DOC.naver, checkedAt: CHECKED, confidence: "low", notes: "2차 자료 기준. 공식 UA 문자열·공개 IP 목록 미확인 → 진위는 항상 검증 불가. AI 브리핑 전용 크롤러는 별도로 확인되지 않음" },
];

export interface Registry {
  version: string;
  entries: BotEntry[];
  sources: Map<string, RangeSource>;
  /** 운영사 → 그 운영사의 모든 범위 출처 id */
  sourcesByOperator: Map<string, string[]>;
}

export function createRegistry(entries: BotEntry[] = BOT_ENTRIES, sources: RangeSource[] = RANGE_SOURCES, version: string = REGISTRY_VERSION): Registry {
  const sourceMap = new Map(sources.map((s) => [s.id, s]));
  const byOperator = new Map<string, string[]>();
  for (const s of sources) {
    const list = byOperator.get(s.operator) ?? [];
    list.push(s.id);
    byOperator.set(s.operator, list);
  }
  return { version, entries, sources: sourceMap, sourcesByOperator: byOperator };
}

export const DEFAULT_REGISTRY: Registry = createRegistry();

/** 레지스트리 자체의 일관성 점검. 데이터를 고칠 때 시험이 이것을 호출한다. */
export function validateRegistry(registry: Registry): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const tokens = new Set<string>();
  for (const e of registry.entries) {
    if (ids.has(e.id)) problems.push(`중복 id: ${e.id}`);
    ids.add(e.id);
    const t = e.uaToken.toLowerCase();
    if (tokens.has(t)) problems.push(`중복 토큰: ${e.uaToken}`);
    tokens.add(t);
    for (const sid of e.rangeSourceIds) {
      const src = registry.sources.get(sid);
      if (!src) problems.push(`${e.id}: 없는 범위 출처 ${sid}`);
      else if (src.operator !== e.operator) problems.push(`${e.id}: 운영사가 다른 범위 출처 ${sid}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checkedAt)) problems.push(`${e.id}: checkedAt 형식`);
    if (!e.sourceDocUrl) problems.push(`${e.id}: 출처 문서 URL 없음`);
  }
  return problems;
}
