// 수집 PC의 설치형 수집기(collector/agent.ts)와 웹 화면 사이의 약속 — 양쪽이 같이 쓴다.
// 운영(Vercel)에는 실제 Chrome이 없어서 수집은 사용자 PC에서 돈다. 웹 화면(브라우저)이
// 다리 역할을 한다: 브라우저가 127.0.0.1의 수집기에 수집을 시키고, 끝난 결과를 받아
// 사용자가 "반영"을 누르면 서버(/api/collection-runs/import)에 올린다. 수집기는
// 서버나 DB에 직접 붙지 않는다.
//
// 이 파일은 브라우저 번들에도 들어가므로 Node 모듈을 import하지 않는다.

/** 수집기가 요청을 받는 포트 — 127.0.0.1에만 연다. */
export const COLLECTOR_AGENT_PORT = 17380;
export const COLLECTOR_AGENT_URL = `http://127.0.0.1:${COLLECTOR_AGENT_PORT}`;

/** 수집기 버전 — 수집 스크립트나 이 약속이 바뀌면 올리고, 웹은 MIN보다 낮으면 업데이트를 안내한다. */
export const COLLECTOR_VERSION = "0.4.3";
export const MIN_COLLECTOR_VERSION = "0.1.0";
/** 사이트맵 크롤 작업을 받을 수 있는 최소 수집기 버전 — 0.1.x 수집기는 이 작업을 모른다. */
export const SITEMAP_CRAWL_MIN_VERSION = "0.2.0";
/** AI Overview 수집 작업을 받을 수 있는 최소 수집기 버전. */
export const AIO_COLLECT_MIN_VERSION = "0.3.0";
/** 네이버 AI 브리핑(통합검색) 수집을 받을 수 있는 최소 수집기 버전 — 이전 수집기는 이 엔진을 모른다. */
export const NAVER_OVERVIEW_MIN_VERSION = "0.4.0";

export type CollectorPlatform = "mac-arm64" | "mac-x64" | "win-x64";

export const COLLECTOR_PLATFORM_LABEL: Record<CollectorPlatform, string> = {
  "mac-arm64": "macOS (Apple 실리콘)",
  "mac-x64": "macOS (Intel)",
  "win-x64": "Windows",
};

export type CollectorEngine = "naver" | "naver-overview" | "google";

export interface CollectorAgentStatus {
  app: "neodio-collector";
  version: string;
  platform: CollectorPlatform | string;
  /** 실제 Chrome이 설치돼 있는지 — 없으면 구글·네이버 수집이 안 된다. */
  chrome: boolean;
  /** 지금 수집 중인 작업 */
  runningJobId: string | null;
}

export type CollectorItemStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface CollectorJobItem {
  keyword: string;
  status: CollectorItemStatus;
  /** 실행 중인 엔진 */
  engine: CollectorEngine | null;
  /** 엔진별로 저장된 결과 수 */
  results: number;
  error: string | null;
}

export type CollectorJobStatus = "queued" | "running" | "done" | "cancelled";

/** 작업 종류 — 없으면(예전 작업) AI 답변 수집. */
export type CollectorJobKind = "collect" | "sitemap-crawl" | "aio-collect";

/** 사이트맵 크롤 작업의 입력 — 사이트맵 전체를 크롤하거나(sitemapUrl), 특정 URL만 다시 크롤한다(urls). */
export interface CollectorCrawlSpec {
  domain: string;
  sitemapUrl: string | null;
  urls: string[];
  limit: number;
}

export interface CollectorJob {
  id: string;
  kind?: CollectorJobKind;
  /** kind === "sitemap-crawl"일 때만 */
  crawl?: CollectorCrawlSpec;
  /** kind === "aio-collect"일 때만 */
  aio?: CollectorAioSpec;
  aioState?: CollectorAioState;
  /** 어느 조직 화면에서 시킨 수집인지 — 반영할 때 확인용으로 보여 준다. */
  label: string;
  engines: CollectorEngine[];
  status: CollectorJobStatus;
  items: CollectorJobItem[];
  createdAt: string;
  finishedAt: string | null;
  /** 서버에 반영한 시각 — 반영 전이면 null */
  appliedAt: string | null;
  log: string[];
}

export type CollectorAioDevice = "mobile" | "desktop";

/** AI Overview 수집 한 건 — 서버가 미리 짠 계획(키워드 × 디바이스)의 한 줄. */
export interface CollectorAioTask {
  keywordId: string;
  keyword: string;
  device: CollectorAioDevice;
}

/** AI Overview 수집 작업의 입력. 어떤 키워드를 수집할지는 서버가 정하고, 수집기는 검색만 한다. */
export interface CollectorAioSpec {
  brandId: string;
  tasks: CollectorAioTask[];
  country: string;
  language: string;
  /** 검색 사이 쉬는 시간(캡차를 피하려는 간격) */
  minDelayMs: number;
  maxDelayMs: number;
}

/** 수집기가 작업 도중 남기는 진행 상태 — 화면이 대기 시간·캡차를 보여 준다. */
export interface CollectorAioState {
  /** 다음 검색까지 쉬는 중이면 끝나는 시각(ms) */
  waitUntil: number | null;
  /** Google이 캡차를 띄워 남은 검색을 멈췄는지 */
  captcha: boolean;
}

/** 검색 한 건의 원본 결과 — 계획의 몇 번째 줄인지(index)와 수집 스크립트가 쓴 JSON. */
export interface CollectorAioResult {
  index: number;
  result: unknown;
}

/** 수집기가 크롤 스크립트로 만든 결과 한 건 — 서버의 SitemapCrawlResult와 같은 모양(반영 때 검증한다). */
export interface CollectorCrawlResult {
  domain: string;
  sitemapUrl: string;
  crawledAt: string;
  urls: unknown[];
}

export interface CollectorRunFile {
  filename: string;
  /** 수집 스크립트가 쓴 JSON의 promptRun(PromptRunSeed) */
  promptRun: unknown;
}

/** "1.2.10" 비교 — a < b면 음수. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
