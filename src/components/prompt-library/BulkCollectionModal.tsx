"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleCheck, Loader2, TriangleAlert, Ban } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CollectionStage } from "@/lib/backend/collectionJobTypes";

const ENGINE_OPTIONS: { id: "naver" | "google"; label: string }[] = [
  { id: "naver", label: "네이버 AI검색" },
  { id: "google", label: "구글 AI 모드" },
];

const STAGE_LABEL: Record<CollectionStage, string> = {
  queued: "수집 PC 대기",
  install: "수집 도구 설치 확인 중",
  naver: "네이버 엔진 수집 중",
  google: "구글 엔진 수집 중",
  save: "결과 저장 중",
  done: "완료",
  error: "실패",
  cancelled: "중단됨",
};

const REMOTE_POLL_MS = 3000;

type ItemState = "pending" | "running" | "done" | "error" | "cancelled";

interface Item {
  keyword: string;
  jobId: string | null;
  state: ItemState;
  stage: CollectionStage | null;
  error: string | null;
}

interface JobStatus {
  jobId: string;
  stage: CollectionStage;
  error: string | null;
  done: boolean;
}

function itemFromStatus(item: Item, status: JobStatus): Item {
  const state: ItemState =
    status.stage === "done" ? "done" : status.stage === "error" ? "error" : status.stage === "cancelled" ? "cancelled" : status.stage === "queued" ? "pending" : "running";
  return { ...item, state, stage: status.stage, error: status.error };
}

// 프롬프트 라이브러리에서 여러 프롬프트를 선택해 "선택 수집"을 누르면, 각
// 프롬프트 문장을 키워드 삼아 실 수집(collection-runs/start와 동일한
// Playwright 기반 네이버/구글 수집)을 돌린다.
// - 로컬(remote=false): 이 대시보드 서버가 브라우저를 직접 띄우는 무거운 작업이라
//   한 번에 하나씩 순서대로 보낸다.
// - 운영(remote=true): 전부 한 번에 대기열에 올리고 수집 PC의 워커가 순서대로
//   실행한다. 창을 닫아도 수집은 계속되고, 여기서는 진행 상태만 본다.
export function BulkCollectionModal({
  open,
  onClose,
  keywords,
  onDone,
  remote,
}: {
  open: boolean;
  onClose: () => void;
  keywords: string[];
  onDone?: () => void;
  remote: boolean;
}) {
  const [engines, setEngines] = useState<Set<"naver" | "google">>(new Set(["naver", "google"]));
  const [items, setItems] = useState<Item[] | null>(null);
  const [running, setRunning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const cancelRef = useRef(false);
  const currentJobIdRef = useRef<string | null>(null);
  // 부모가 매 렌더 새 함수를 넘겨도 상태 확인(effect)이 다시 시작되지 않게.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  function toggleEngine(id: "naver" | "google") {
    setEngines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 대기열 모드 — 올린 작업들의 상태를 한 번에 확인한다.
  const remoteJobIds = remote && items ? items.map((it) => it.jobId).filter((id): id is string => !!id) : [];
  const remoteKey = remoteJobIds.join(",");
  useEffect(() => {
    if (!remote || !running || !remoteKey) return;
    let stopped = false;
    async function poll() {
      const res = await fetch(`/api/collection-runs/status?jobIds=${encodeURIComponent(remoteKey)}`).catch(() => null);
      if (!res?.ok || stopped) return;
      const data: { jobs: JobStatus[]; workerOnline: boolean | null } = await res.json();
      const byId = new Map(data.jobs.map((job) => [job.jobId, job]));
      setWorkerOnline(data.workerOnline);
      setItems((prev) => prev && prev.map((it) => (it.jobId && byId.has(it.jobId) ? itemFromStatus(it, byId.get(it.jobId)!) : it)));
      if (data.jobs.length > 0 && data.jobs.every((job) => job.done)) {
        setRunning(false);
        onDoneRef.current?.();
      }
    }
    poll();
    const timer = setInterval(poll, REMOTE_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [remote, running, remoteKey]);

  async function pollUntilDone(jobId: string, onUpdate: (stage: CollectionStage) => void): Promise<{ error: string | null }> {
    while (!cancelRef.current) {
      const res = await fetch(`/api/collection-runs/status?jobId=${jobId}`);
      if (!res.ok) return { error: "작업 상태를 확인하지 못했습니다." };
      const data: { stage: CollectionStage; error: string | null; done: boolean } = await res.json();
      onUpdate(data.stage);
      if (data.done) return { error: data.stage === "cancelled" ? "중단됨" : data.error };
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return { error: "취소됨" };
  }

  async function startRemote() {
    setRunning(true);
    const res = await fetch("/api/collection-runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords, engines: Array.from(engines) }),
    })
      .then((r) => r.json())
      .catch(() => null);
    const jobIds: string[] | undefined = res?.jobIds;
    if (!jobIds || jobIds.length !== keywords.length) {
      setRunning(false);
      setSubmitError(res?.error ?? "수집을 시작하지 못했습니다.");
      return;
    }
    setItems(keywords.map((keyword, i) => ({ keyword, jobId: jobIds[i], state: "pending", stage: "queued", error: null })));
  }

  async function startLocal() {
    const initial: Item[] = keywords.map((keyword) => ({ keyword, jobId: null, state: "pending", stage: null, error: null }));
    setItems(initial);
    setRunning(true);

    for (let i = 0; i < keywords.length; i++) {
      if (cancelRef.current) break;
      const keyword = keywords[i];
      setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, state: "running", stage: "install" } : it)));

      const res = await fetch("/api/collection-runs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, engines: Array.from(engines) }),
      })
        .then((r) => r.json())
        .catch(() => null);

      if (!res?.jobId) {
        setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, state: "error", error: res?.error ?? "수집을 시작하지 못했습니다." } : it)));
        continue;
      }
      currentJobIdRef.current = res.jobId;

      const { error } = await pollUntilDone(res.jobId, (stage) => {
        setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, stage } : it)));
      });

      setItems((prev) => prev!.map((it, idx) => (idx === i ? { ...it, state: error ? "error" : "done", error } : it)));
    }

    setRunning(false);
    if (!cancelRef.current) onDone?.();
  }

  async function start() {
    if (keywords.length === 0 || engines.size === 0) return;
    setSubmitError(null);
    cancelRef.current = false;
    if (remote) await startRemote();
    else await startLocal();
  }

  // 대기열 모드의 "남은 수집 취소" — 대기 중인 건 바로 취소되고, 실행 중인 건 수집 PC가 멈춘다.
  async function cancelRemaining() {
    const pending = items?.filter((it) => it.jobId && (it.state === "pending" || it.state === "running")).map((it) => it.jobId!) ?? [];
    if (pending.length === 0) return;
    setCancelling(true);
    await fetch("/api/collection-runs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobIds: pending }),
    }).catch(() => null);
    setCancelling(false);
  }

  function close() {
    // 대기열 모드는 창을 닫아도 수집 PC에서 계속된다 — 상태 확인만 멈춘다.
    if (running && !remote) {
      cancelRef.current = true;
      // 다음 순서로 넘어가는 것만 막는 걸로는 부족하다 — 지금 서버에서 돌고
      // 있는 프로세스도 실제로 죽여야 한다.
      const jobId = currentJobIdRef.current;
      if (jobId) {
        fetch("/api/collection-runs/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        }).catch(() => null);
      }
    }
    setItems(null);
    setRunning(false);
    setSubmitError(null);
    setWorkerOnline(null);
    onClose();
  }

  const doneCount = items?.filter((it) => it.state === "done" || it.state === "error" || it.state === "cancelled").length ?? 0;
  const waitingForWorker = remote && running && workerOnline === false && items?.some((it) => it.state === "pending");

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">선택한 프롬프트 수집</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        {remote
          ? `선택한 ${items?.length ?? keywords.length}개 프롬프트를 키워드로 삼아 수집 PC에서 순서대로 실 수집을 실행합니다. 이 창을 닫아도 수집은 계속됩니다.`
          : `선택한 ${items?.length ?? keywords.length}개 프롬프트를 키워드로 삼아 순서대로 실 수집을 실행합니다. 하나씩 진행되며, 완료까지 시간이 걸릴 수 있습니다.`}
      </p>

      {!items && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-500">엔진</span>
            <div className="flex h-10 items-center gap-4">
              {ENGINE_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-center gap-1.5 text-sm text-neutral-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={engines.has(opt.id)}
                    onChange={() => toggleEngine(opt.id)}
                    className="size-4 accent-slate-800"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
            {keywords.map((k) => (
              <div key={k} className="truncate py-0.5">
                {k}
              </div>
            ))}
          </div>
          {submitError && <p className="text-xs text-red-600">{submitError}</p>}
          {!remote && (
            <p className="border-t border-neutral-100 pt-3 text-[11px] text-amber-700">
              ⚠️ 구글 수집 중에는 시크릿 크롬 창이 실제로 열립니다. 진행되는 동안 그 창을 직접 닫지 말아주세요.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            <Button variant="primary" disabled={engines.size === 0 || running} onClick={start}>
              수집 시작
            </Button>
          </div>
        </div>
      )}

      {items && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs font-medium text-neutral-500">
            {doneCount} / {items.length} 완료
          </p>
          {waitingForWorker && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              지금 연결된 수집 PC가 없어 대기 중입니다. 수집 PC가 연결되면 순서대로 시작됩니다.
            </p>
          )}
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {items.map((it, index) => (
              <div key={it.jobId ?? `${index}-${it.keyword}`} className="flex items-center gap-2.5 rounded-md border border-neutral-100 px-3 py-2 text-sm">
                {it.state === "done" ? (
                  <CircleCheck size={16} className="shrink-0 text-emerald-500" />
                ) : it.state === "error" ? (
                  <TriangleAlert size={16} className="shrink-0 text-red-500" />
                ) : it.state === "cancelled" ? (
                  <Ban size={16} className="shrink-0 text-neutral-400" />
                ) : it.state === "running" ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-slate-600" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border-2 border-neutral-200" />
                )}
                <span className="min-w-0 flex-1 truncate text-neutral-800">{it.keyword}</span>
                <span className="shrink-0 text-[11px] text-neutral-400">
                  {it.state === "error" ? it.error ?? "실패" : it.stage ? STAGE_LABEL[it.stage] : it.state === "pending" ? "대기" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {running && remote && (
              <Button variant="secondary" onClick={cancelRemaining} disabled={cancelling}>
                {cancelling ? "취소하는 중..." : "남은 수집 취소"}
              </Button>
            )}
            {running && !remote ? (
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
            ) : (
              <Button variant="primary" icon={<Check size={14} />} onClick={close}>
                {running ? "닫기" : "확인"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
