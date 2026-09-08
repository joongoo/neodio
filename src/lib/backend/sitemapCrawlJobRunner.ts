import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { SitemapCrawlJob } from "./sitemapCrawlJobTypes";

// In-memory job store, same pattern and same lifetime caveats as
// collectionJobRunner.ts (single local dev process, lost on `next dev` restart).
const jobs = new Map<string, SitemapCrawlJob>();
const isWindows = process.platform === "win32";

function runCommand(command: string, args: string[], onLog: (line: string) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: isWindows });
    child.stdout?.on("data", (chunk) => onLog(chunk.toString()));
    child.stderr?.on("data", (chunk) => onLog(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}

function appendLog(job: SitemapCrawlJob, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) job.log.push(trimmed);
  }
  if (job.log.length > 200) job.log = job.log.slice(-200);
}

export function getSitemapCrawlJob(id: string): SitemapCrawlJob | undefined {
  return jobs.get(id);
}

export function startSitemapCrawlJob(domain: string, sitemapUrl: string): SitemapCrawlJob {
  const id = `sitemap-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: SitemapCrawlJob = {
    id,
    domain,
    sitemapUrl,
    stage: "install",
    log: [],
    error: null,
    result: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);

  runJob(job).catch((error) => {
    job.stage = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = Date.now();
  });

  return job;
}

async function runJob(job: SitemapCrawlJob) {
  job.stage = "install";
  appendLog(job, "Playwright 브라우저 설치 확인 중...");
  const npx = isWindows ? "npx.cmd" : "npx";
  const installCode = await runCommand(npx, ["playwright", "install", "chromium"], (line) => appendLog(job, line));
  if (installCode !== 0) {
    throw new Error("Playwright 브라우저 설치에 실패했습니다. 로그를 확인해주세요.");
  }

  job.stage = "sitemap";
  let outputPath: string | null = null;

  const npm = isWindows ? "npm.cmd" : "npm";
  const code = await runCommand(
    npm,
    ["run", "crawl:sitemap", "--", "--sitemap", job.sitemapUrl, "--domain", job.domain],
    (line) => {
      for (const raw of line.split("\n")) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (trimmed === "STAGE:crawl_pages") {
          job.stage = "crawl";
          continue;
        }
        if (trimmed.startsWith("STAGE:")) continue;
        const match = trimmed.match(/"outputPath":\s*"([^"]+)"/);
        if (match) outputPath = match[1];
        appendLog(job, trimmed);
      }
    }
  );

  if (code !== 0) {
    throw new Error("사이트맵 크롤이 실패했습니다. 로그를 확인해주세요.");
  }
  if (!outputPath) {
    throw new Error("크롤 결과 파일을 찾지 못했습니다.");
  }

  const saved = JSON.parse(await readFile(outputPath, "utf8"));
  const urls = saved.urls ?? [];
  const averageContentVisibility =
    urls.length > 0 ? Math.round(urls.reduce((sum: number, u: { contentVisibility: number }) => sum + u.contentVisibility, 0) / urls.length) : 0;
  job.result = { urlCount: urls.length, averageContentVisibility, urls };

  job.stage = "done";
  job.finishedAt = Date.now();
}
