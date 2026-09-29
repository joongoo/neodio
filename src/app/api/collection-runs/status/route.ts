import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/backend/collectionJobRunner";
import { isCollectionWorkerOnline } from "@/lib/backend/collectionQueue";
import type { CollectionJob } from "@/lib/backend/collectionJobTypes";

const MAX_JOB_IDS = 100;

function isDone(job: CollectionJob) {
  return job.stage === "done" || job.stage === "error" || job.stage === "cancelled";
}

function summarize(job: CollectionJob) {
  return {
    jobId: job.id,
    stage: job.stage,
    log: job.log.slice(-20),
    error: job.error,
    done: isDone(job),
    engines: job.engines,
    keyword: job.keyword,
    runner: job.runner ?? "local",
  };
}

// ?jobId=… 하나, 또는 ?jobIds=a,b,… 여러 개(선택 수집을 대기열에 한 번에 올렸을 때).
// 수집 PC 워커가 맡는 작업이 아직 안 끝났으면 워커가 켜져 있는지도 같이 알려 준다.
export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("jobIds")?.split(",").filter(Boolean).slice(0, MAX_JOB_IDS);
  if (ids) {
    const jobs = (await Promise.all(ids.map((id) => getJob(id)))).filter((job): job is CollectionJob => !!job);
    const waitingOnWorker = jobs.some((job) => job.runner === "worker" && !isDone(job));
    return NextResponse.json({ jobs: jobs.map(summarize), workerOnline: waitingOnWorker ? await isCollectionWorkerOnline() : null });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");
  const job = jobId ? await getJob(jobId) : undefined;
  if (!job) {
    return NextResponse.json({ error: "존재하지 않거나 만료된 작업입니다." }, { status: 404 });
  }
  const waitingOnWorker = job.runner === "worker" && !isDone(job);
  return NextResponse.json({ ...summarize(job), workerOnline: waitingOnWorker ? await isCollectionWorkerOnline() : null });
}
