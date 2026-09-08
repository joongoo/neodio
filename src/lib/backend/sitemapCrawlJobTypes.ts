// Client-safe (no node:child_process) — same split as collectionJobTypes.ts.
export type SitemapCrawlStage = "install" | "sitemap" | "crawl" | "done" | "error";

export interface SitemapCrawlUrlResult {
  url: string;
  status: "success" | "failed";
  rawTextLength: number;
  renderedTextLength: number;
  contentVisibility: number;
  error: string | null;
}

export interface SitemapCrawlJob {
  id: string;
  domain: string;
  sitemapUrl: string;
  stage: SitemapCrawlStage;
  log: string[];
  error: string | null;
  result: { urlCount: number; averageContentVisibility: number; urls: SitemapCrawlUrlResult[] } | null;
  startedAt: number;
  finishedAt: number | null;
}
