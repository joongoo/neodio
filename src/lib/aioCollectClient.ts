"use client";

import { AIO_COLLECT_MIN_VERSION, type CollectorAioSpec, type CollectorJob } from "./collectorAgent";
import { createAgentAioJob, cancelAgentJob, getAgentAioResults, getAgentJob, getAgentStatus, listAgentJobs, markAgentJobApplied } from "./collectorClient";
import { agentReadiness, openCollectorSetup } from "./collectorSetup";
import type { AioCollectJob, AioJobResult } from "./backend/aio/jobTypes";

// YouTube AIO "지금 수집"의 화면 쪽 창구 — 어디서 검색하는지는 여기서 숨긴다.
//   · 로컬 개발: 이 서버가 Chrome을 띄워 직접 수집한다(/api/youtube-aio/collect).
//   · 운영(서버리스): 서버가 수집 계획만 돌려주고(agent), 사용자 PC의 설치형 수집기가 검색한다. 검색이 하나 끝날 때마다
//     이 창구가 그 결과를 /api/youtube-aio/import로 올려 서버가 자사 영상 판정과 저장을 한다.
// 호출하는 화면은 두 경우를 똑같이 다룬다: start → job, poll(id) → job. 수집기가 없거나 오래됐거나 Chrome이 없으면
// 설치 안내 창(CollectorSetupHost)을 띄우고 handled로 알린다.

const AGENT_PREFIX = "agent:";

export type AioStart = { ok: true; job: AioCollectJob } | { ok: false; error: string; handled: boolean; jobId?: string };

/** 수집기 작업의 진행 + 지금까지 서버에 올려 판정된 결과 → 화면이 쓰는 작업 모양 */
function toAioJob(agentJob: CollectorJob, results: AioJobResult[]): AioCollectJob {
  const spec = agentJob.aio!;
  const state = agentJob.aioState;
  const active = agentJob.status === "queued" || agentJob.status === "running";
  const runningIndex = agentJob.items.findIndex((item) => item.status === "running");
  const finishedAt = agentJob.finishedAt ? Date.parse(agentJob.finishedAt) : null;
  const errored = agentJob.items.filter((item) => item.status === "error");
  let status: AioCollectJob["status"] = "running";
  let error: string | null = null;
  if (!active) {
    if (agentJob.status === "cancelled") status = "cancelled";
    else if (state?.captcha) status = "captcha";
    else if (errored.length > 0 && errored.length === agentJob.items.length) {
      // 모든 검색이 실패했다(하나라도 성공했으면 완료로 보이고 실패한 건 결과 목록에 실패로 남는다).
      status = "error";
      error = errored[0].error ?? "수집 중 오류가 발생했습니다.";
    } else status = "done";
  }
  return {
    id: `${AGENT_PREFIX}${agentJob.id}`,
    brandId: spec.brandId,
    label: agentJob.label,
    status,
    total: spec.tasks.length,
    current: runningIndex >= 0 ? { keyword: spec.tasks[runningIndex].keyword, device: spec.tasks[runningIndex].device } : null,
    waitUntil: active && runningIndex < 0 ? state?.waitUntil ?? null : null,
    results,
    error,
    startedAt: Date.parse(agentJob.createdAt),
    finishedAt,
  };
}

export async function startAioCollect(input: { brandId: string; keywordId?: string; promptIds?: string[]; force: boolean }): Promise<AioStart> {
  const res = await fetch("/api/youtube-aio/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) return { ok: false, error: data?.error ?? "수집을 시작하지 못했습니다.", handled: false, jobId: data?.jobId };
  if (!data?.agent) return { ok: true, job: data.job };

  const status = await getAgentStatus();
  const reason = agentReadiness(status, AIO_COLLECT_MIN_VERSION);
  if (reason) {
    openCollectorSetup({ reason, status });
    return { ok: false, error: "", handled: true };
  }
  const { label, ...spec } = data.agent as CollectorAioSpec & { label: string };
  try {
    const job = await createAgentAioJob(spec, label);
    return { ok: true, job: toAioJob(job, []) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "수집기에 수집을 시키지 못했습니다.", handled: false };
  }
}

// 검색 결과 한 건은 한 번만 올린다 — 같은 작업을 폴링이 겹쳐 부르거나 화면을 다시 열어도 중복 저장하지 않는다.
const uploads = new Map<string, Promise<AioJobResult>>();

function uploadResult(agentJob: CollectorJob, index: number, raw: unknown): Promise<AioJobResult> {
  const key = `${agentJob.id}:${index}`;
  let pending = uploads.get(key);
  if (!pending) {
    const spec = agentJob.aio!;
    const task = spec.tasks[index];
    pending = (async (): Promise<AioJobResult> => {
      const base = { keyword: task.keyword, device: task.device };
      const res = await fetch("/api/youtube-aio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: spec.brandId, keywordId: task.keywordId, device: task.device, result: raw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ...base, status: "failed", captcha: false, sources: 0, youtube: 0, ownPositions: [], message: data?.error ?? "결과를 저장하지 못했습니다." };
      }
      return { ...base, status: data.status, captcha: !!data.captcha, sources: data.sources, youtube: data.youtube, ownPositions: data.ownPositions ?? [], message: data.message ?? null };
    })().catch(
      (error): AioJobResult => ({
        keyword: task.keyword,
        device: task.device,
        status: "failed",
        captcha: false,
        sources: 0,
        youtube: 0,
        ownPositions: [],
        message: error instanceof Error ? error.message : "결과를 저장하지 못했습니다.",
      })
    );
    uploads.set(key, pending);
  }
  return pending;
}

async function agentSnapshot(agentJobId: string): Promise<AioCollectJob | null> {
  let agentJob: CollectorJob;
  try {
    agentJob = await getAgentJob(agentJobId);
  } catch {
    // 수집기가 잠깐 안 보이는 동안(재시작 등)은 다음 폴링에서 다시 묻는다.
    return null;
  }
  if (!agentJob.aio) return null;

  const results: AioJobResult[] = [];
  const finishedIndexes = agentJob.items.flatMap((item, index) => (item.status === "done" ? [index] : []));
  const raws = finishedIndexes.length > 0 ? await getAgentAioResults(agentJobId).catch(() => []) : [];
  const rawByIndex = new Map(raws.map((r) => [r.index, r.result]));
  for (const [index, item] of agentJob.items.entries()) {
    if (item.status === "done" && rawByIndex.has(index)) results.push(await uploadResult(agentJob, index, rawByIndex.get(index)));
    else if (item.status === "error") {
      const task = agentJob.aio.tasks[index];
      results.push({ keyword: task.keyword, device: task.device, status: "failed", captcha: false, sources: 0, youtube: 0, ownPositions: [], message: item.error });
    }
  }

  const job = toAioJob(agentJob, results);
  // 수집기가 다 끝냈어도 올린 결과가 다 반영된 뒤에야 끝난 것으로 보인다(화면이 그때 데이터를 다시 읽는다).
  const pendingUploads = finishedIndexes.some((index) => !rawByIndex.has(index));
  if (job.status !== "running" && pendingUploads) return { ...job, status: "running" };
  if (job.status !== "running" && !agentJob.appliedAt) await markAgentJobApplied(agentJobId).catch(() => undefined);
  return job;
}

export async function pollAioCollect(jobId: string): Promise<AioCollectJob | null> {
  if (jobId.startsWith(AGENT_PREFIX)) return agentSnapshot(jobId.slice(AGENT_PREFIX.length));
  const res = await fetch(`/api/youtube-aio/collect?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return data?.job ?? null;
}

export async function cancelAioCollect(jobId: string): Promise<void> {
  if (jobId.startsWith(AGENT_PREFIX)) {
    await cancelAgentJob(jobId.slice(AGENT_PREFIX.length)).catch(() => undefined);
    return;
  }
  await fetch(`/api/youtube-aio/collect?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => null);
}

/** 새로고침·다른 탭에서 돌아왔을 때 이어 볼 수집 — 진행 중이거나, 끝났는데 아직 서버에 올리지 않은 것. */
export async function resumeAioCollect(brandId: string): Promise<AioCollectJob | null> {
  const res = await fetch(`/api/youtube-aio/collect?brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (data?.job?.status === "running") return data.job;

  const status = await getAgentStatus();
  if (!status || agentReadiness(status, AIO_COLLECT_MIN_VERSION) === "outdated") return null;
  const jobs = await listAgentJobs().catch(() => []);
  const candidate = jobs
    .filter((job) => job.kind === "aio-collect" && job.aio?.brandId === brandId && !job.appliedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return candidate ? agentSnapshot(candidate.id) : null;
}
