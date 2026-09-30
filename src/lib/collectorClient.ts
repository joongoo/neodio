"use client";

import {
  COLLECTOR_AGENT_URL,
  type CollectorAgentStatus,
  type CollectorCrawlResult,
  type CollectorCrawlSpec,
  type CollectorEngine,
  type CollectorJob,
  type CollectorPlatform,
  type CollectorRunFile,
} from "./collectorAgent";

// 브라우저 → 사용자 PC의 수집기(127.0.0.1) 호출. 수집기가 꺼져 있거나 설치돼
// 있지 않으면 연결 자체가 실패한다 — 그 경우 null/예외로 알린다.

async function call<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(`${COLLECTOR_AGENT_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `수집기 요청 실패 (${res.status})`);
  return data as T;
}

/** 수집기 상태 — 연결되지 않으면 null(설치 안 됨, 꺼져 있음, 브라우저가 접근을 막음). */
export async function getAgentStatus(): Promise<CollectorAgentStatus | null> {
  try {
    const status = await call<CollectorAgentStatus>("/status", { timeoutMs: 3000 });
    return status.app === "neodio-collector" ? status : null;
  } catch {
    return null;
  }
}

export async function listAgentJobs(): Promise<CollectorJob[]> {
  return (await call<{ jobs: CollectorJob[] }>("/jobs")).jobs;
}

export async function createAgentJob(keywords: string[], engines: CollectorEngine[], label: string): Promise<CollectorJob> {
  return (await call<{ job: CollectorJob }>("/jobs", { method: "POST", body: JSON.stringify({ keywords, engines, label }) })).job;
}

export async function createAgentCrawlJob(crawl: Partial<CollectorCrawlSpec> & { domain: string }, label: string): Promise<CollectorJob> {
  return (await call<{ job: CollectorJob }>("/jobs", { method: "POST", body: JSON.stringify({ kind: "sitemap-crawl", crawl, label }) })).job;
}

/** 끝난 사이트맵 크롤 작업의 결과(도메인·크롤 시각·URL별 지표). */
export async function getAgentCrawlResults(id: string): Promise<CollectorCrawlResult[]> {
  return (await call<{ crawls: CollectorCrawlResult[] }>(`/jobs/${encodeURIComponent(id)}/crawl`, { timeoutMs: 30_000 })).crawls;
}

export async function getAgentJob(id: string): Promise<CollectorJob> {
  return (await call<{ job: CollectorJob }>(`/jobs/${encodeURIComponent(id)}`)).job;
}

export async function cancelAgentJob(id: string): Promise<void> {
  await call(`/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });
}

export async function getAgentResults(id: string): Promise<CollectorRunFile[]> {
  return (await call<{ runs: CollectorRunFile[] }>(`/jobs/${encodeURIComponent(id)}/results`, { timeoutMs: 30_000 })).runs;
}

export async function markAgentJobApplied(id: string): Promise<void> {
  await call(`/jobs/${encodeURIComponent(id)}/applied`, { method: "POST", body: "{}" });
}

/**
 * 이 PC의 운영체제로 받을 설치 파일. Mac은 칩 종류를 Chrome에서만 알 수 있어
 * 모르면 null(두 가지를 다 보여 준다).
 */
export async function detectCollectorPlatform(): Promise<CollectorPlatform | null> {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win-x64";
  if (!/Macintosh|Mac OS X/i.test(ua)) return null;
  const uaData = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> } })
    .userAgentData;
  try {
    const { architecture } = (await uaData?.getHighEntropyValues?.(["architecture"])) ?? {};
    if (architecture === "arm") return "mac-arm64";
    if (architecture === "x86") return "mac-x64";
  } catch {
    // 알 수 없음
  }
  return null;
}

/** 수집기 결과 중 반영할 것이 남은 작업 — 진행 중이거나, 끝났는데 아직 반영하지 않은 것. */
export function isPendingAgentJob(job: CollectorJob): boolean {
  // 사이트맵 크롤 작업은 "선택 수집"의 반영 대기 목록에 섞이지 않는다(크롤 화면이 따로 반영한다).
  if (job.kind === "sitemap-crawl") return false;
  if (job.appliedAt) return false;
  if (job.status === "queued" || job.status === "running") return true;
  return job.items.some((item) => item.results > 0);
}
