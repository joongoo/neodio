"use client";

import { SITEMAP_CRAWL_MIN_VERSION, type CollectorAgentStatus, type CollectorCrawlResult } from "./collectorAgent";
import { agentReadiness, openCollectorSetup, type CollectorSetupReason } from "./collectorSetup";
import {
  createAgentCrawlJob,
  getAgentCrawlResults,
  getAgentJob,
  getAgentStatus,
  markAgentJobApplied,
} from "./collectorClient";
import type { SitemapCrawlJob } from "./backend/sitemapCrawlJobTypes";

// 사이트맵 크롤을 시작하고 진행을 묻는 화면 쪽 창구 — 어디서 크롤하는지는 여기서 숨긴다.
//   · 로컬 개발: 이 서버가 직접 크롤한다(/api/sitemap-crawl/start·status).
//   · 운영(서버리스): 서버가 code "agent"로 알려 주면 사용자 PC의 설치형 수집기가 크롤하고,
//     끝난 결과를 이 창구가 받아 /api/sitemap-crawl/import로 올린다.
// 호출하는 화면은 두 경우를 똑같이 다룬다: start → jobId, status를 폴링 → done.
// 수집기가 없거나 오래됐거나 Chrome이 없으면 설치 안내 창(CollectorSetupHost)을 띄우고 handled로 알린다.

export { COLLECTOR_SETUP_EVENT, type CollectorSetupDetail, type CollectorSetupReason } from "./collectorSetup";

export type CrawlStart = { ok: true; jobId: string } | { ok: false; error: string; handled: boolean };

export interface CrawlStatus {
  stage: SitemapCrawlJob["stage"];
  log: string[];
  error: string | null;
  result: SitemapCrawlJob["result"];
  done: boolean;
}

const AGENT_PREFIX = "agent:";

/** 수집기가 크롤을 받을 준비가 됐는지 — 아니면 이유. */
export function crawlReadiness(status: CollectorAgentStatus | null): CollectorSetupReason | null {
  return agentReadiness(status, SITEMAP_CRAWL_MIN_VERSION);
}

export async function startSitemapCrawl(input: { domain: string; sitemapUrl?: string; urls?: string[] }): Promise<CrawlStart> {
  const res = await fetch("/api/sitemap-crawl/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, jobId: body.jobId };
  if (body.code !== "agent") return { ok: false, error: body.error ?? "사이트맵 크롤을 시작하지 못했습니다.", handled: false };

  const status = await getAgentStatus();
  const reason = crawlReadiness(status);
  if (reason) {
    openCollectorSetup({ reason, status });
    return { ok: false, error: "", handled: true };
  }
  try {
    const job = await createAgentCrawlJob(
      { domain: input.domain, sitemapUrl: input.urls?.length ? null : input.sitemapUrl ?? null, urls: input.urls ?? [] },
      input.domain
    );
    return { ok: true, jobId: `${AGENT_PREFIX}${job.id}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "수집기에 크롤을 시키지 못했습니다.", handled: false };
  }
}

// 같은 작업을 여러 곳에서 동시에 폴링해도 결과는 한 번만 올린다.
const imports = new Map<string, Promise<{ error: string | null; result: CrawlStatus["result"] }>>();

function summarize(crawls: CollectorCrawlResult[]): CrawlStatus["result"] {
  const urls = crawls.flatMap((crawl) => crawl.urls as NonNullable<CrawlStatus["result"]>["urls"]);
  const ok = urls.filter((u) => u.status === "success");
  return {
    urlCount: urls.length,
    averageContentVisibility: ok.length > 0 ? Math.round(ok.reduce((sum, u) => sum + u.contentVisibility, 0) / ok.length) : 0,
    urls,
  };
}

function importAgentCrawl(agentJobId: string) {
  let pending = imports.get(agentJobId);
  if (!pending) {
    pending = (async () => {
      const crawls = await getAgentCrawlResults(agentJobId);
      if (crawls.length === 0) return { error: "크롤 결과가 없습니다.", result: null };
      const res = await fetch("/api/sitemap-crawl/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawls, jobId: agentJobId }),
      });
      if (!res.ok) return { error: (await res.json().catch(() => null))?.error ?? "크롤 결과를 저장하지 못했습니다.", result: null };
      await markAgentJobApplied(agentJobId).catch(() => undefined);
      return { error: null, result: summarize(crawls) };
    })().catch((error) => ({ error: error instanceof Error ? error.message : "크롤 결과를 저장하지 못했습니다.", result: null }));
    imports.set(agentJobId, pending);
  }
  return pending;
}

function stageFromLog(log: string[]): CrawlStatus["stage"] {
  if (log.some((line) => line.startsWith("STAGE:crawl_pages") || /^진행 \d+\/\d+/.test(line))) return "crawl";
  return "sitemap";
}

export async function getSitemapCrawlStatus(jobId: string): Promise<CrawlStatus | null> {
  if (!jobId.startsWith(AGENT_PREFIX)) {
    const res = await fetch(`/api/sitemap-crawl/status?jobId=${encodeURIComponent(jobId)}`);
    return res.ok ? ((await res.json()) as CrawlStatus) : null;
  }

  const agentJobId = jobId.slice(AGENT_PREFIX.length);
  let job;
  try {
    job = await getAgentJob(agentJobId);
  } catch {
    // 수집기가 잠깐 안 보이는 동안(재시작 등)은 다음 폴링에서 다시 묻는다.
    return null;
  }
  const log = job.log.slice(-20);
  const item = job.items[0];
  if (job.status === "queued" || job.status === "running") {
    return { stage: stageFromLog(log), log, error: null, result: null, done: false };
  }
  if (job.status === "cancelled" || item?.status === "error") {
    return { stage: "error", log, error: item?.error ?? "크롤이 중단됐습니다.", result: null, done: true };
  }
  const imported = await importAgentCrawl(agentJobId);
  if (imported.error) return { stage: "error", log, error: imported.error, result: null, done: true };
  return { stage: "done", log, error: null, result: imported.result, done: true };
}
