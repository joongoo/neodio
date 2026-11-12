"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CollectorProblem, type Problem } from "./AgentCollectionModal";
import { MIN_COLLECTOR_VERSION, NAVER_OVERVIEW_MIN_VERSION, compareVersions, type CollectorAgentStatus, type CollectorEngine, type CollectorJob, type CollectorPlatform } from "@/lib/collectorAgent";
import { cancelAgentJob, createAgentJob, getAgentJob, getAgentResults, getAgentStatus, markAgentJobApplied } from "@/lib/collectorClient";
import { cancelAioCollect, pollAioCollect, startAioCollect } from "@/lib/aioCollectClient";
import type { AioCollectJob } from "@/lib/backend/aio/jobTypes";
import type { CollectStep } from "@/lib/collectSteps";
import { SURFACE_LABEL } from "@/lib/promptSurfaces";

// "선택 수집"의 통합 진행 창 — 선택한 플랫폼을 한꺼번에 시작한다. 레인(네이버 / 구글 / Gemini)이 서로 기다리지 않아서
// 구글에서 캡차가 떠도 네이버·Gemini 수집은 계속 돌아간다. 답변 수집(네이버·구글AI) 결과는 끝나는 대로 자동 반영하고,
// AIO는 검색마다 서버에 올려 판정·저장한다.

const POLL_MS = 2000;
const SERP_POLL_MS = 15_000;
const SERP_BATCH_SIZE = 20;
const IMPORT_CHUNK = 20;
const ENGINE_LABEL: Record<CollectorEngine, string> = { naver: "네이버AI", "naver-overview": "네이버AIO", google: "구글AI" };

type PanelState = { label: string; done: number; total: number; current: string | null; waitUntil: number | null; phase: "running" | "done" | "stopped" | "error"; note: string | null };

function stepLabel(step: CollectStep): string {
  if (step.kind === "aio") return "구글AIO";
  if (step.kind === "gemini") return "Gemini";
  if (step.kind === "serp-api") return `${SURFACE_LABEL[step.surface]} · SERP API`;
  return step.engines.map((e) => ENGINE_LABEL[e]).join(" · ");
}

function stepTotal(step: CollectStep): number {
  if (step.kind === "aio") return step.promptIds.length;
  if (step.kind === "serp-api") return step.prompts.length;
  return step.keywords.length;
}

export function ParallelCollectModal({
  steps,
  orgName,
  brandId,
  downloadPlatforms,
  onClose,
  onDone,
}: {
  steps: CollectStep[];
  orgName: string;
  brandId: string;
  downloadPlatforms: CollectorPlatform[];
  onClose: () => void;
  onDone: () => void;
}) {
  const needsAgent = steps.some((s) => s.kind === "ai" || s.kind === "aio");
  const [gate, setGate] = useState<"checking" | "ready" | { problem: Problem; status: CollectorAgentStatus | null }>(needsAgent ? "checking" : "ready");
  const [states, setStates] = useState<PanelState[]>(() =>
    steps.map((s) => ({ label: stepLabel(s), done: 0, total: stepTotal(s), current: null, waitUntil: null, phase: "running", note: null }))
  );
  const cancels = useRef<(() => void)[]>(steps.map(() => () => {}));
  const doneNotified = useRef(false);

  const patch = useCallback((index: number, next: Partial<PanelState>) => {
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
  }, []);
  const setCancel = useCallback((index: number, fn: () => void) => {
    cancels.current[index] = fn;
  }, []);

  const run = useCallback(async () => {
    const status = await getAgentStatus();
    const needsOverview = steps.some((s) => s.kind === "ai" && s.engines.includes("naver-overview"));
    const problem: Problem | null = !status
      ? "unreachable"
      : compareVersions(status.version, needsOverview ? NAVER_OVERVIEW_MIN_VERSION : MIN_COLLECTOR_VERSION) < 0
        ? "outdated"
        : !status.chrome
          ? "no_chrome"
          : null;
    setGate(problem ? { problem, status } : "ready");
  }, [steps]);
  const check = useCallback(() => {
    setGate("checking");
    return run();
  }, [run]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 수집기 확인은 외부(PC 수집기) 상태를 읽는 일
    if (needsAgent) void run();
  }, [needsAgent, run]);

  const allFinished = states.every((s) => s.phase !== "running");
  useEffect(() => {
    if (gate === "ready" && allFinished && !doneNotified.current && states.some((s) => s.done > 0)) {
      doneNotified.current = true;
      onDone();
    }
  }, [gate, allFinished, states, onDone]);

  const running = gate === "ready" && !allFinished;
  const close = () => {
    if (running && !window.confirm("수집 중입니다. 창을 닫아도 이 PC의 수집기는 계속 수집하지만 결과 자동 반영은 멈춥니다. 닫을까요?")) return;
    onClose();
  };

  return (
    <Modal open onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{gate === "ready" || gate === "checking" ? "선택 수집 진행" : "수집기 확인"}</h2>
        <ModalCloseButton onClose={close} />
      </div>

      {gate === "checking" && (
        <div className="mt-6 flex justify-center">
          <Loader2 size={20} className="animate-spin text-neutral-400" />
        </div>
      )}

      {typeof gate === "object" && (
        <CollectorProblem problem={gate.problem} status={gate.status} downloadPlatforms={downloadPlatforms} busy={false} onRetry={check} onBack={onClose} />
      )}

      {gate === "ready" && (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-sm text-neutral-500">
            {allFinished ? "모든 수집이 끝났습니다." : "플랫폼별로 동시에 수집합니다. 한 플랫폼이 멈춰도 다른 플랫폼은 계속 진행됩니다."}
          </p>
          {steps.map((step, index) => (
            <PanelShell key={index} state={states[index]} onCancel={() => cancels.current[index]()}>
              {step.kind === "serp-api" ? (
                <SerpApiRunner step={step} brandId={brandId} index={index} patch={patch} setCancel={setCancel} />
              ) : step.kind === "ai" ? (
                <AgentAiRunner step={step} orgName={orgName} index={index} patch={patch} setCancel={setCancel} />
              ) : step.kind === "aio" ? (
                <AioRunner brandId={brandId} promptIds={step.promptIds} index={index} patch={patch} setCancel={setCancel} />
              ) : (
                <GeminiRunner keywords={step.keywords} index={index} patch={patch} setCancel={setCancel} />
              )}
            </PanelShell>
          ))}
          <div className="flex justify-end">
            <Button variant="primary" onClick={allFinished ? onClose : close}>
              {allFinished ? "확인" : "닫기"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// 다음 검색까지 남은 대기 시간 — 1초마다 줄어든다. 대기 중이 아니면 null.
function useCountdown(waitUntil: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waitUntil) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 대기가 시작된 순간의 시각으로 맞춘다
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitUntil]);
  if (!waitUntil) return null;
  const seconds = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PanelShell({ state, onCancel, children }: { state: PanelState; onCancel: () => void; children: React.ReactNode }) {
  const countdown = useCountdown(state.phase === "running" ? state.waitUntil : null);
  const percent = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : state.phase === "running" ? 0 : 100;
  const warn = state.phase === "stopped" || state.phase === "error";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-800">
          {state.phase === "running" ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-slate-600" />
          ) : state.phase === "done" ? (
            <CircleCheck size={16} className="shrink-0 text-emerald-500" />
          ) : (
            <TriangleAlert size={16} className="shrink-0 text-amber-500" />
          )}
          <span className="shrink-0">{state.label}</span>
          {state.current && state.phase === "running" && <span className="truncate text-xs font-normal text-neutral-500">{state.current}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {countdown && <span className="tabular-nums text-xs text-neutral-400" title="다음 검색까지 대기 시간">다음 검색 {countdown}</span>}
          <span className="tabular-nums text-xs text-neutral-500">
            {state.done}/{state.total || "…"}
          </span>
          {state.phase === "running" && (
            <button type="button" onClick={onCancel} className="grid size-6 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer" aria-label={`${state.label} 중단`}>
              <Ban size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full transition-all ${warn ? "bg-amber-400" : "bg-slate-700"}`} style={{ width: `${percent}%` }} />
      </div>
      {state.note && <p className={`text-xs ${warn ? "text-amber-700" : "text-neutral-500"}`}>{state.note}</p>}
      {children}
    </div>
  );
}

interface RunnerProps {
  index: number;
  patch: (index: number, next: Partial<PanelState>) => void;
  setCancel: (index: number, fn: () => void) => void;
}

type SerpProviderTask = {
  id: string;
  status: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
};

const SERP_TERMINAL = new Set(["completed", "submission_unknown", "provider_failed", "parse_failed", "cancelled"]);

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function postSerpTasks(path: "submit" | "status", brandId: string, taskIds: string[], signal: AbortSignal): Promise<SerpProviderTask[]> {
  const response = await fetch(`/api/dataforseo/tasks/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, taskIds }),
    signal,
  });
  const data = await response.json().catch(() => ({})) as { error?: string; tasks?: SerpProviderTask[] };
  if (!response.ok) throw new Error(data.error ?? `SERP API ${path === "submit" ? "제출" : "상태 조회"}에 실패했습니다.`);
  return data.tasks ?? [];
}

// 예약 → Provider 제출 → 결과 회수·저장까지 같은 진행 패널에서 수행한다.
function SerpApiRunner({ step, brandId, index, patch, setCancel }: RunnerProps & { step: Extract<CollectStep, { kind: "serp-api" }>; brandId: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    const controller = new AbortController();
    setCancel(index, () => {
      stopped = true;
      controller.abort();
      patch(index, { phase: "stopped", note: "화면의 상태 확인을 중단했습니다. 이미 제출된 작업은 DataForSEO에서 계속 처리됩니다." });
    });

    (async () => {
      try {
        const res = await fetch("/api/dataforseo/tasks/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, surface: step.surface, prompts: step.prompts, requestId: step.requestId }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({})) as { error?: string; reserved?: number; created?: number; tasks?: SerpProviderTask[] };
        if (!res.ok) throw new Error(data.error ?? "SERP API 작업을 예약하지 못했습니다.");
        if (stopped) return;
        const taskIds = (data.tasks ?? []).map((task) => task.id);
        if (taskIds.length === 0) throw new Error("예약된 SERP API 작업이 없습니다.");
        patch(index, { done: 0, total: taskIds.length, current: `0/${taskIds.length}건 제출`, note: `${data.created ?? taskIds.length}건을 예약했습니다.` });

        const state = new Map<string, SerpProviderTask>();
        let submitted = 0;
        for (const batch of chunks(taskIds, SERP_BATCH_SIZE)) {
          const tasks = await postSerpTasks("submit", brandId, batch, controller.signal);
          if (tasks.length !== batch.length) throw new Error("DataForSEO 제출 응답의 작업 수가 일치하지 않습니다.");
          for (const task of tasks) state.set(task.id, task);
          submitted += batch.length;
          patch(index, { current: `${submitted}/${taskIds.length}건 제출` });
          const blocked = tasks.find((task) => task.status === "reserved" || task.status === "submitting");
          if (blocked) throw new Error(blocked.errorMessage ?? "DataForSEO 작업이 제출되지 않았습니다.");
          if (stopped) return;
        }

        while (!stopped) {
          for (const batch of chunks(taskIds, SERP_BATCH_SIZE)) {
            const tasks = await postSerpTasks("status", brandId, batch, controller.signal);
            if (tasks.length !== batch.length) throw new Error("DataForSEO 상태 응답의 작업 수가 일치하지 않습니다.");
            for (const task of tasks) state.set(task.id, task);
          }
          const tasks = [...state.values()];
          const completed = tasks.filter((task) => task.status === "completed").length;
          const terminal = tasks.filter((task) => SERP_TERMINAL.has(task.status)).length;
          const failed = tasks.filter((task) => SERP_TERMINAL.has(task.status) && task.status !== "completed").length;
          const actualCost = tasks.reduce((sum, task) => sum + (task.actualCostUsd || 0), 0);
          patch(index, {
            done: terminal,
            total: taskIds.length,
            current: terminal < taskIds.length ? `${completed}건 저장 · ${taskIds.length - terminal}건 처리 중` : null,
            note: `실제 비용 USD ${actualCost.toFixed(4)}${failed ? ` · 실패 ${failed}건` : ""}`,
          });
          if (terminal >= taskIds.length) {
            const firstFailure = tasks.find((task) => task.status !== "completed");
            patch(index, {
              phase: failed === taskIds.length ? "error" : "done",
              current: null,
              note: failed
                ? `저장 ${completed}건 · 실패 ${failed}건 · USD ${actualCost.toFixed(4)}${firstFailure?.errorMessage ? ` (${firstFailure.errorMessage})` : ""}`
                : `${completed}건을 저장했습니다. 실제 비용 USD ${actualCost.toFixed(4)}`,
            });
            router.refresh();
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, SERP_POLL_MS);
            controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
          });
        }
      } catch (error) {
        if (!stopped) patch(index, { phase: "error", current: null, note: error instanceof Error ? error.message : "SERP API 수집에 실패했습니다." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// 네이버 / 구글AI — 수집기에 작업을 만들고, 끝나면 결과를 서버에 반영한다.
function AgentAiRunner({ step, orgName, index, patch, setCancel }: RunnerProps & { step: Extract<CollectStep, { kind: "ai" }>; orgName: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    let jobId: string | null = null;
    setCancel(index, () => {
      stopped = true;
      if (jobId) void cancelAgentJob(jobId).catch(() => undefined);
      patch(index, { phase: "stopped", note: "중단했습니다. 그 전까지 끝난 결과는 반영되지 않았을 수 있습니다." });
    });

    (async () => {
      try {
        const created = await createAgentJob(step.keywords, step.engines, orgName);
        jobId = created.id;
        let job: CollectorJob = created;
        while (!stopped) {
          job = await getAgentJob(created.id).catch(() => job);
          const finished = job.items.filter((it) => it.status === "done" || it.status === "error" || it.status === "cancelled").length;
          const running = job.items.find((it) => it.status === "running");
          patch(index, { done: finished, total: job.items.length, current: running ? `${running.keyword}` : null, waitUntil: job.waitUntil ?? null });
          if (job.status === "done" || job.status === "cancelled") break;
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        if (stopped) return;
        const runs = await getAgentResults(created.id);
        for (let i = 0; i < runs.length; i += IMPORT_CHUNK) {
          const res = await fetch("/api/collection-runs/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runs: runs.slice(i, i + IMPORT_CHUNK) }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error ?? "반영하지 못했습니다.");
        }
        await markAgentJobApplied(created.id);
        const failed = job.items.filter((it) => it.status === "error").length;
        patch(index, {
          phase: job.status === "cancelled" ? "stopped" : "done",
          current: null,
          waitUntil: null,
          note: `${runs.length}건을 반영했습니다${failed > 0 ? ` · 실패 ${failed}개` : ""}.`,
        });
        router.refresh();
      } catch (e) {
        if (!stopped) patch(index, { phase: "error", current: null, note: e instanceof Error ? e.message : "수집하지 못했습니다." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// 구글AIO — 수집기가 검색하고, 검색마다 서버에 올려 판정한다.
function AioRunner({ brandId, promptIds, index, patch, setCancel }: RunnerProps & { brandId: string; promptIds: string[] }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    let jobId: string | null = null;
    setCancel(index, () => {
      stopped = true;
      if (jobId) void cancelAioCollect(jobId);
      patch(index, { phase: "stopped", note: "중단했습니다. 그 전까지 수집한 결과는 저장됐습니다." });
    });

    (async () => {
      const result = await startAioCollect({ brandId, promptIds, force: false });
      if (!result.ok) {
        patch(index, { phase: "error", note: result.error || "수집기를 확인하세요." });
        return;
      }
      let job: AioCollectJob = result.job;
      jobId = job.id;
      while (!stopped) {
        patch(index, {
          done: job.results.length,
          total: job.total,
          current: job.current ? job.current.keyword : null,
          waitUntil: job.waitUntil,
        });
        if (job.status !== "running") break;
        await new Promise((r) => setTimeout(r, POLL_MS));
        job = (await pollAioCollect(job.id)) ?? job;
      }
      if (stopped) return;
      router.refresh();
      patch(index, {
        done: job.results.length,
        total: job.total,
        current: null,
        waitUntil: null,
        phase: job.status === "done" ? "done" : job.status === "cancelled" ? "stopped" : "error",
        note:
          job.status === "done"
            ? job.total === 0
              ? "오늘 이미 모두 수집했습니다."
              : `${job.results.length}건이 반영됐습니다.`
            : job.status === "captcha"
              ? "Google 캡차로 멈췄습니다. 남은 프롬프트는 잠시 뒤 다시 수집하세요. 다른 플랫폼은 계속 진행됩니다."
              : job.error ?? "수집을 마치지 못했습니다.",
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Gemini — 서버가 API로 한 건씩 묻는다(수집기 불필요).
function GeminiRunner({ keywords, index, patch, setCancel }: RunnerProps & { keywords: string[] }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    setCancel(index, () => {
      stopped = true;
      patch(index, { phase: "stopped", note: "중단했습니다." });
    });

    (async () => {
      let ok = 0;
      let failed = 0;
      let lastError: string | null = null;
      for (let i = 0; i < keywords.length && !stopped; i++) {
        patch(index, { current: keywords[i] });
        try {
          const res = await fetch("/api/gemini-collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: keywords[i] }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.ok) ok++;
          else {
            failed++;
            lastError = data.error ?? `오류 ${res.status}`;
          }
          patch(index, { done: ok + failed });
          if (res.status === 503) break;
        } catch {
          failed++;
          lastError = "네트워크 오류";
          patch(index, { done: ok + failed });
        }
      }
      if (stopped) return;
      patch(index, {
        phase: failed > 0 && ok === 0 ? "error" : "done",
        current: null,
        note: `성공 ${ok}개${failed > 0 ? `, 실패 ${failed}개${lastError ? ` (${lastError})` : ""}` : ""}`,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
