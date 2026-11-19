"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, Clock3, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CollectorProblem, type Problem } from "./AgentCollectionModal";
import { MIN_COLLECTOR_VERSION, NAVER_OVERVIEW_MIN_VERSION, compareVersions, type CollectorAgentStatus, type CollectorEngine, type CollectorJob, type CollectorPlatform } from "@/lib/collectorAgent";
import { cancelAgentJob, createAgentJob, getAgentJob, getAgentResults, getAgentStatus, markAgentJobApplied } from "@/lib/collectorClient";
import { cancelAioCollect, pollAioCollect, startAioCollect } from "@/lib/aioCollectClient";
import type { AioCollectJob } from "@/lib/backend/aio/jobTypes";
import type { CollectStep } from "@/lib/collectSteps";
import { SURFACE_LABEL } from "@/lib/promptSurfaces";
import { useTenantBase } from "@/lib/useTenantBase";

// "선택 수집"의 통합 진행 창 — 선택한 플랫폼을 한꺼번에 시작한다. 레인(네이버 / 구글 / Gemini)이 서로 기다리지 않아서
// 구글에서 캡차가 떠도 네이버·Gemini 수집은 계속 돌아간다. 답변 수집(네이버·구글AI) 결과는 끝나는 대로 자동 반영하고,
// AIO는 검색마다 서버에 올려 판정·저장한다.

const POLL_MS = 2000;
const SERP_RESERVE_BATCH_SIZE = 200;
const IMPORT_CHUNK = 20;
const ENGINE_LABEL: Record<CollectorEngine, string> = { naver: "네이버AI", "naver-overview": "네이버AIO", google: "구글AI" };

type PanelState = { label: string; done: number; total: number; current: string | null; waitUntil: number | null; phase: "waiting" | "running" | "done" | "stopped" | "error"; note: string | null };

function stepLabel(step: CollectStep): string {
  if (step.kind === "aio") return "구글AIO";
  if (step.kind === "gemini") return "Gemini";
  if (step.kind === "serp-api") return `${SURFACE_LABEL[step.surface]} · SERP API`;
  return step.engines.map((e) => ENGINE_LABEL[e]).join(" · ");
}

function stepTotal(step: CollectStep): number {
  if (step.kind === "aio") return step.promptIds.length;
  if (step.kind === "serp-api") return step.taskIds?.length ?? step.prompts.length;
  return step.keywords.length;
}

export function ParallelCollectModal({
  steps,
  orgName,
  brandId,
  downloadPlatforms,
  onClose,
  onDone,
  serverCollector = false,
  collectionLogHref,
}: {
  steps: CollectStep[];
  orgName: string;
  brandId: string;
  downloadPlatforms: CollectorPlatform[];
  onClose: () => void;
  onDone: () => void;
  serverCollector?: boolean;
  collectionLogHref?: string;
}) {
  const router = useRouter();
  const tenantBase = useTenantBase();
  const needsAgent = !serverCollector && steps.some((s) => s.kind === "ai" || s.kind === "aio");
  const [gate, setGate] = useState<"checking" | "ready" | { problem: Problem; status: CollectorAgentStatus | null }>(needsAgent ? "checking" : "ready");
  const [states, setStates] = useState<PanelState[]>(() =>
    steps.map((s) => ({ label: stepLabel(s), done: 0, total: stepTotal(s), current: null, waitUntil: null, phase: "running", note: null }))
  );
  const cancels = useRef<(() => void)[]>(steps.map(() => () => {}));
  const doneNotified = useRef(false);
  const legacyStarted = useRef(new Set<number>());
  const latestStates = useRef(states);
  const delayedLeave = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { latestStates.current = states; }, [states]);

  const patch = useCallback((index: number, next: Partial<PanelState>) => {
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...next } : s)));
    const step = steps[index];
    if (step.kind !== "serp-api" && step.requestId) {
      const terminal = next.phase && next.phase !== "running";
      if (terminal || !legacyStarted.current.has(index)) {
        legacyStarted.current.add(index);
        void fetch("/api/collection-requests/legacy", { method: "PATCH", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step, phase: next.phase ?? "running", note: next.note }),
        }).then(response => {
          if (!response.ok) throw new Error(`수집 요청 상태 저장 오류 (${response.status})`);
        }).catch(error => console.error("수집 요청 진행 상태 저장 실패", error));
      }
    }
  }, [steps]);
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
    if (problem) steps.forEach((step, index) => {
      if (step.kind !== "serp-api") patch(index, { phase: "waiting", note: "수집기를 확인하지 못해 대기 중입니다. 수집기 연결 후 다시 시작해 주세요." });
    });
    else setStates(previous => previous.map(state => state.phase === "waiting" ? { ...state, phase: "running", note: null } : state));
  }, [steps, patch]);
  const check = useCallback(() => {
    setGate("checking");
    return run();
  }, [run]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 수집기 확인은 외부(PC 수집기) 상태를 읽는 일
    if (needsAgent) void run();
  }, [needsAgent, run]);

  const serpIndexes = steps.flatMap((step, index) => step.kind === "serp-api" ? [index] : []);
  const legacyIndexes = steps.flatMap((step, index) => step.kind === "serp-api" ? [] : [index]);
  const serpRegistering = serpIndexes.some((index) => states[index].phase === "running");
  const serpFailed = serpIndexes.some((index) => states[index].phase === "error" || states[index].phase === "stopped");
  const serpFailureNotes = [...new Set(serpIndexes.flatMap((index) =>
    (states[index].phase === "error" || states[index].phase === "stopped") && states[index].note
      ? [states[index].note]
      : []
  ))];
  const serpRegistered = serpIndexes.length > 0 && !serpRegistering && !serpFailed;
  const legacyRunning = legacyIndexes.some((index) => states[index].phase === "running");
  const allFinished = states.every((s) => s.phase !== "running");
  useEffect(() => {
    if (delayedLeave.current) clearTimeout(delayedLeave.current);
    const requestIds = [...new Set(steps.filter(s => s.kind !== "serp-api").map(s => s.requestId).filter((id): id is string => !!id))];
    if (!requestIds.length) return;
    const running = () => steps.some((s, index) => s.kind !== "serp-api" && latestStates.current[index]?.phase === "running");
    const report = (action: "heartbeat" | "leave") => {
      for (const requestId of requestIds) void fetch("/api/collection-requests/legacy/session", {
        method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action }),
      }).then(async response => {
        if (!response.ok || action !== "heartbeat") return;
        const data = await response.json() as { cancelRequested?: boolean };
        if (data.cancelRequested) {
          steps.forEach((step, index) => { if (step.kind !== "serp-api" && step.requestId === requestId && latestStates.current[index]?.phase === "running") cancels.current[index](); });
          void fetch("/api/collection-requests/legacy/session", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, action: "leave" }) }).catch(() => undefined);
        }
      }).catch(() => undefined);
    };
    const leave = () => {
      if (!running()) return;
      steps.forEach((s, index) => { if (s.kind !== "serp-api" && latestStates.current[index]?.phase === "running") cancels.current[index](); });
      report("leave");
    };
    report("heartbeat");
    const heartbeat = setInterval(() => { if (running()) report("heartbeat"); }, 10_000);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
      // React development replays effects; only a real unmount releases the session.
      delayedLeave.current = setTimeout(leave, 0);
    };
  }, [steps]);
  useEffect(() => {
    if (gate === "ready" && allFinished && !doneNotified.current && states.some((s) => s.done > 0)) {
      doneNotified.current = true;
      onDone();
    }
  }, [gate, allFinished, states, onDone]);

  const close = () => {
    if (serpRegistering && !window.confirm("SERP API 작업을 등록 중입니다. 지금 닫으면 일부 작업이 등록되지 않을 수 있습니다. 닫을까요?")) return false;
    if (legacyRunning && !window.confirm("진행 중인 로컬 수집을 중단하고 닫을까요? SERP API 작업은 계속 진행됩니다. 중단한 로컬 항목은 요청 상세에서 다시 시도할 수 있습니다.")) return false;
    onClose();
    return true;
  };

  return (
    <Modal open onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{gate === "ready" || gate === "checking" ? "선택 수집 진행" : "수집기 확인"}</h2>
        <ModalCloseButton onClose={close} />
      </div>

      {serpIndexes.map((index) => (
        <SerpApiRunner key={`serp-register-${index}`} step={steps[index] as Extract<CollectStep, { kind: "serp-api" }>} brandId={brandId} index={index} patch={patch} setCancel={setCancel} />
      ))}

      {serpIndexes.length > 0 && (
        <div className={`mt-3 rounded-lg border px-3 py-3 text-sm ${serpFailed ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          <div className="flex items-center gap-2 font-medium">
            {serpRegistering ? <Loader2 size={15} className="animate-spin" /> : serpFailed ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}
            {serpRegistering ? "SERP API 작업 큐 등록 중" : serpRegistered ? "SERP API 작업 큐 등록 완료" : "일부 작업을 등록하지 못했습니다"}
          </div>
          <p className="mt-1 text-xs opacity-80">
            {serpRegistering
              ? "등록이 끝나면 이 화면을 닫아도 서버에서 수집을 이어갑니다."
              : serpRegistered
                ? "로컬 완료와 관계없이 SERP API 작업이 등록되었습니다. 이후 진행 상황과 결과는 수집 로그에서 확인할 수 있습니다."
                : "등록하지 못한 작업을 확인한 뒤 다시 시도해 주세요."}
          </p>
          {serpFailureNotes.map((note) => <p key={note} className="mt-1 text-xs font-medium">{note}</p>)}
          {serpRegistered && (
            <button type="button" className="mt-2 text-xs font-semibold underline underline-offset-2" onClick={() => { if (close()) router.push(collectionLogHref ?? `${tenantBase}/collection-runs`); }}>
              수집 로그 보기
            </button>
          )}
        </div>
      )}

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
            {legacyIndexes.length === 0
              ? serpRegistering ? "SERP API 수집 작업을 등록하고 있습니다." : "SERP API 수집 작업을 등록했습니다."
              : allFinished ? "모든 수집이 끝났습니다." : `${serpIndexes.length ? "SERP API는 로컬 완료를 기다리지 않고 바로 등록됩니다. " : ""}로컬 수집 결과 반영을 마치려면 이 화면을 유지하세요. 이탈하면 미완료 로컬 항목은 요청 상세에서 다시 시도할 수 있습니다.`}
          </p>
          {steps.map((step, index) => step.kind === "serp-api" ? null : (
            <PanelShell key={index} state={states[index]} onCancel={() => cancels.current[index]()}>
              {step.kind === "ai" && serverCollector ? (
                <ServerAiRunner step={step} index={index} patch={patch} setCancel={setCancel} />
              ) : step.kind === "ai" ? (
                <AgentAiRunner step={step} orgName={orgName} index={index} patch={patch} setCancel={setCancel} />
              ) : step.kind === "aio" ? (
                <AioRunner brandId={brandId} promptIds={step.promptIds} devices={step.devices} targets={step.targets} requestId={step.requestId} index={index} patch={patch} setCancel={setCancel} />
              ) : (
                <GeminiRunner keywords={step.keywords} requestId={step.requestId} index={index} patch={patch} setCancel={setCancel} />
              )}
            </PanelShell>
          ))}
          {legacyIndexes.length > 0 && <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={allFinished ? onClose : close}>
              {allFinished ? "확인" : "닫기"}
            </Button>
          </div>}
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
          ) : state.phase === "waiting" ? (
            <Clock3 size={16} className="shrink-0 text-neutral-500" />
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
  created?: boolean;
  query?: string;
  estimatedCostUsd: number;
};

async function reserveSerpTaskBatches(
  step: Extract<CollectStep, { kind: "serp-api" }>,
  brandId: string,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<Response> {
  const tasks: SerpProviderTask[] = [];
  let created = 0;
  let estimatedCostUsd = 0;
  let processedPrompts = 0;
  for (const promptBatch of chunks(step.prompts, SERP_RESERVE_BATCH_SIZE)) {
    const response = await fetch("/api/dataforseo/tasks/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, surface: step.surface, prompts: promptBatch, requestId: step.requestId, force: step.force === true }),
      signal,
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      created?: number;
      estimatedCostUsd?: number;
      tasks?: SerpProviderTask[];
    };
    if (!response.ok) return Response.json({ error: data.error }, { status: response.status });
    tasks.push(...(data.tasks ?? []));
    created += data.created ?? 0;
    estimatedCostUsd += data.estimatedCostUsd ?? 0;
    processedPrompts += promptBatch.length;
    onProgress(processedPrompts, step.prompts.length);
  }
  const activeQueries = [...new Set(tasks.filter((task) => task.created === false).map((task) => task.query).filter(Boolean))] as string[];
  const examples = activeQueries.slice(0, 3).map((query) => `“${query}”`).join(", ");
  const notice = activeQueries.length > 0
    ? `${created}건 신규 예약 · ${activeQueries.length}개 프롬프트는 ${SURFACE_LABEL[step.surface]}에서 이미 수집 중이라 기존 진행을 이어갑니다.${examples ? ` (${examples}${activeQueries.length > 3 ? " 외" : ""})` : ""}`
    : `${created}건을 신규 예약했습니다.`;
  return Response.json({ reserved: tasks.length, created, alreadyActive: tasks.length - created, estimatedCostUsd, notice, tasks });
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

// 화면에서는 승인된 작업을 DB 큐에 예약하는 데까지만 책임진다.
// Provider 제출과 결과 회수는 서버 worker가 이어가며, 진행 상태는 수집 로그에서 확인한다.
function SerpApiRunner({ step, brandId, index, patch, setCancel }: RunnerProps & { step: Extract<CollectStep, { kind: "serp-api" }>; brandId: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    setCancel(index, () => {
      stopped = true;
      controller.abort();
      patch(index, { phase: "stopped", note: "작업 큐 등록을 중단했습니다." });
    });

    (async () => {
      try {
        if ((step.taskIds?.length ?? 0) === 0) {
          const res = await reserveSerpTaskBatches(step, brandId, controller.signal, (done, total) => {
            patch(index, { current: `${done}/${total}건 예약 확인` });
          });
          const data = await res.json().catch(() => ({})) as { error?: string; reserved?: number; created?: number; notice?: string; tasks?: SerpProviderTask[] };
          if (!res.ok) throw new Error(data.error ?? "SERP API 작업을 예약하지 못했습니다.");
          if (stopped) return;
          const taskIds = (data.tasks ?? []).map((task) => task.id);
          if (taskIds.length === 0) throw new Error("예약된 SERP API 작업이 없습니다.");
          patch(index, {
            done: taskIds.length,
            total: taskIds.length,
            current: null,
            phase: "done",
            note: `${data.notice ?? `${data.created ?? taskIds.length}건을 예약했습니다.`} 진행 상황은 수집 로그에서 확인하세요.`,
          });
        } else {
          patch(index, {
            done: step.taskIds?.length ?? 0,
            total: step.taskIds?.length ?? 0,
            current: null,
            phase: "done",
            note: "이미 작업 큐에 등록되었습니다. 진행 상황은 수집 로그에서 확인하세요.",
          });
        }
        router.refresh();
      } catch (error) {
        if (!stopped) patch(index, { phase: "error", current: null, note: error instanceof Error ? error.message : "SERP API 수집에 실패했습니다." });
      }
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function ServerAiRunner({ step, index, patch, setCancel }: RunnerProps & { step: Extract<CollectStep, { kind: "ai" }> }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    let currentJobId: string | null = null;
    const cancel = () => {
      stopped = true;
      if (currentJobId) void fetch("/api/collection-runs/cancel", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: currentJobId }) }).catch(() => undefined);
      patch(index, { phase: "stopped", current: null, note: "페이지 이탈 또는 사용자 요청으로 중단했습니다." });
    };
    setCancel(index, cancel);
    void (async () => {
      try {
        if (step.engines.includes("naver-overview")) throw new Error("네이버 AIO 로컬 수집은 설치형 수집기 모드가 필요합니다.");
        let failures = 0;
        for (let i = 0; i < step.keywords.length && !stopped; i++) {
          patch(index, { current: step.keywords[i] });
          const response = await fetch("/api/collection-runs/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: step.keywords[i], engines: step.engines, requestId: step.requestId }) });
          const created = await response.json();
          if (!response.ok || !created.jobId) throw new Error(created.error ?? "로컬 수집을 시작하지 못했습니다.");
          currentJobId = created.jobId;
          if (stopped) { cancel(); return; }
          while (!stopped) {
            const status = await fetch(`/api/collection-runs/status?jobId=${encodeURIComponent(created.jobId)}`, { cache: "no-store" });
            const data = await status.json();
            if (!status.ok) throw new Error(data.error ?? "로컬 수집 상태를 확인하지 못했습니다.");
            if (data.done) { if (data.error || data.stage === "cancelled") failures++; break; }
            await new Promise(resolve => setTimeout(resolve, POLL_MS));
          }
          currentJobId = null;
          patch(index, { done: i + 1 });
        }
        if (!stopped) patch(index, { phase: failures ? "error" : "done", current: null, note: failures ? `${failures}개 수집을 마치지 못했습니다.` : "로컬 수집 결과를 반영했습니다." });
      } catch (cause) {
        if (!stopped) patch(index, { phase: "error", current: null, note: cause instanceof Error ? cause.message : "로컬 수집에 실패했습니다." });
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
        if (stopped) { await cancelAgentJob(created.id).catch(() => undefined); return; }
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
          if (stopped) return;
          const res = await fetch("/api/collection-runs/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runs: runs.slice(i, i + IMPORT_CHUNK), requestId: step.requestId }),
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
        if (!stopped) patch(index, { phase: jobId ? "error" : "waiting", current: null, note: e instanceof Error ? e.message : "수집하지 못했습니다." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// 구글AIO — 수집기가 검색하고, 검색마다 서버에 올려 판정한다.
function AioRunner({ brandId, promptIds, devices, targets, requestId, index, patch, setCancel }: RunnerProps & { brandId: string; promptIds: string[]; devices?: ("desktop" | "mobile")[]; targets?: { promptId: string; device: "desktop" | "mobile" }[]; requestId?: string }) {
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
      const result = await startAioCollect({ brandId, promptIds, devices, targets, requestId, force: false });
      if (!result.ok) {
        patch(index, { phase: result.handled ? "waiting" : "error", note: result.error || "수집기를 확인하세요." });
        return;
      }
      let job: AioCollectJob = result.job;
      jobId = job.id;
      if (stopped) { await cancelAioCollect(job.id); return; }
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
function GeminiRunner({ keywords, requestId, index, patch, setCancel }: RunnerProps & { keywords: string[]; requestId?: string }) {
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
            body: JSON.stringify({ query: keywords[i], requestId }),
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
