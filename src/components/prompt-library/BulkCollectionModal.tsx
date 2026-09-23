"use client";

import { useRef, useState } from "react";
import { Check, CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CollectionStage } from "@/lib/backend/collectionJobTypes";

const ENGINE_OPTIONS: { id: "naver" | "google"; label: string }[] = [
  { id: "naver", label: "네이버 AI검색" },
  { id: "google", label: "구글 AI 모드" },
];

const STAGE_LABEL: Record<CollectionStage, string> = {
  install: "수집 도구 설치 확인 중",
  naver: "네이버 엔진 수집 중",
  google: "구글 엔진 수집 중",
  save: "결과 저장 중",
  done: "완료",
  error: "실패",
  cancelled: "중단됨",
};

type ItemState = "pending" | "running" | "done" | "error";

interface Item {
  keyword: string;
  state: ItemState;
  stage: CollectionStage | null;
  error: string | null;
}

// 프롬프트 라이브러리에서 여러 프롬프트를 선택해 "선택 수집"을 누르면, 각
// 프롬프트 문장을 키워드 삼아 실 수집(collection-runs/start와 동일한
// Playwright 기반 네이버/구글 수집)을 순서대로 돌린다. 브라우저를 직접
// 띄우는 무거운 작업이라(구글은 시크릿 크롬 창까지 연다) 여러 개를
// 동시에 돌리지 않고 한 번에 하나씩만 진행한다 — 수집 로그 페이지의
// 단일 키워드 수집(CollectionRunForm)과 같은 API를 재사용한다.
export function BulkCollectionModal({
  open,
  onClose,
  keywords,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  keywords: string[];
  onDone?: () => void;
}) {
  const [engines, setEngines] = useState<Set<"naver" | "google">>(new Set(["naver", "google"]));
  const [items, setItems] = useState<Item[] | null>(null);
  const [running, setRunning] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const currentJobIdRef = useRef<string | null>(null);

  function toggleEngine(id: "naver" | "google") {
    setEngines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  async function start() {
    if (keywords.length === 0 || engines.size === 0) return;
    setSubmitError(null);
    cancelRef.current = false;
    const initial: Item[] = keywords.map((keyword) => ({ keyword, state: "pending", stage: null, error: null }));
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
      }).then((r) => r.json())
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

  function close() {
    if (running) {
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
    onClose();
  }

  const doneCount = items?.filter((it) => it.state === "done" || it.state === "error").length ?? 0;

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">선택한 프롬프트 수집</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        선택한 {keywords.length}개 프롬프트를 키워드로 삼아 순서대로 실 수집을 실행합니다. 하나씩 진행되며, 완료까지 시간이 걸릴 수 있습니다.
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
          <p className="border-t border-neutral-100 pt-3 text-[11px] text-amber-700">
            ⚠️ 구글 수집 중에는 시크릿 크롬 창이 실제로 열립니다. 진행되는 동안 그 창을 직접 닫지 말아주세요.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            <Button variant="primary" disabled={engines.size === 0} onClick={start}>
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
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {items.map((it) => (
              <div key={it.keyword} className="flex items-center gap-2.5 rounded-md border border-neutral-100 px-3 py-2 text-sm">
                {it.state === "done" ? (
                  <CircleCheck size={16} className="shrink-0 text-emerald-500" />
                ) : it.state === "error" ? (
                  <TriangleAlert size={16} className="shrink-0 text-red-500" />
                ) : it.state === "running" ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-slate-600" />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border-2 border-neutral-200" />
                )}
                <span className="min-w-0 flex-1 truncate text-neutral-800">{it.keyword}</span>
                <span className="shrink-0 text-[11px] text-neutral-400">
                  {it.state === "error" ? it.error ?? "실패" : it.state === "pending" ? "대기" : it.stage ? STAGE_LABEL[it.stage] : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {running ? (
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
            ) : (
              <Button variant="primary" icon={<Check size={14} />} onClick={close}>
                확인
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
