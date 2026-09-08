import { NextRequest, NextResponse } from "next/server";
import { getSitemapCrawlJob } from "@/lib/backend/sitemapCrawlJobRunner";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const job = jobId ? getSitemapCrawlJob(jobId) : undefined;

  if (!job) {
    return NextResponse.json({ error: "존재하지 않거나 만료된 작업입니다." }, { status: 404 });
  }

  return NextResponse.json({
    stage: job.stage,
    log: job.log.slice(-20),
    error: job.error,
    result: job.result,
    done: job.stage === "done" || job.stage === "error",
  });
}
