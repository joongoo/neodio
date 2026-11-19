"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { ParallelCollectModal } from "@/components/prompt-library/ParallelCollectModal";
import type { CollectStep } from "@/lib/collectSteps";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import { retrySelectionCost, isPendingSerpSelection, pendingSelectionCost, type RetrySelectionItem } from "@/lib/requestRetrySelection";
import { Modal } from "@/components/ui/Modal";

export function RequestSelectionButtons({ selectedCount, locked, selectableCount, onSelectAll, onClearSelection }: {
  selectedCount: number; locked: boolean; selectableCount?: number;
  onSelectAll: () => void; onClearSelection: () => void;
}) {
  return <>
    <Button className="disabled:opacity-40 disabled:cursor-not-allowed" variant="secondary" disabled={locked || selectableCount === 0} onClick={onSelectAll}>전체 선택{selectableCount !== undefined && ` (${selectableCount})`}</Button>
    <Button variant="ghost" disabled={locked || selectedCount === 0} onClick={onClearSelection}>전체 선택 해제</Button>
  </>;
}

export function RequestCollectControl({ requestId, brandId, orgName, base, downloadPlatforms, serverCollector, selected, onChanged, onSelectAll, onClearSelection, selectableCount, selecting }: {
  requestId: string; brandId: string; orgName: string; base: string; downloadPlatforms: CollectorPlatform[]; serverCollector: boolean;
  selected: RetrySelectionItem[]; onChanged: () => void; onSelectAll: () => void; onClearSelection: () => void;
  selecting: boolean; selectableCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ requestId: string; steps: CollectStep[]; notice?: string | null } | null>(null);
  const [action, setAction] = useState<"retry" | "cancel" | "wake" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingSerp = isPendingSerpSelection(selected);
  const hasPendingSerp = selected.some(item => item.executionKind === "serp-api" && item.status === "reserved");
  const waiting = pendingSerp || (selected.length > 0 && selected.every(item => item.executionKind === "legacy" && item.status === "reserved"));
  const cost = pendingSerp ? pendingSelectionCost(selected) : retrySelectionCost(selected);
  const hasLocal = selected.some(item => item.executionKind === "legacy");
  const validAction = action === "wake" ? pendingSerp : action === "cancel" ? waiting : action === "retry" ? !hasPendingSerp : false;
  async function start() {
    if (!action || !validAction || !selected.length || busy || selecting) return;
    setBusy(true); setError(null);
    try {
      const endpoint = pendingSerp ? "pending" : action === "cancel" ? "retry-legacy" : "retry";
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), confirmed: true, action, itemIds: selected.map(item => item.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "재시도 요청을 등록하지 못했습니다.");
      setAction(null);
      if (action === "cancel" || action === "wake") { onChanged(); setNotice(data.notice ?? "대기 작업을 취소했습니다."); router.refresh(); }
      else { onChanged(); setRetry(data); router.refresh(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "재시도를 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <EditOnly>
    <div className="flex flex-wrap items-center gap-2">
        <RequestSelectionButtons selectedCount={selected.length} locked={selecting || busy || !!retry} selectableCount={selectableCount} onSelectAll={onSelectAll} onClearSelection={onClearSelection} />
        <span className="mr-auto text-xs text-neutral-500">{selected.length}건 선택 · 로컬 / SERP API · 엔진 고정</span>
        <Button disabled={!selected.length || busy || selecting || !!retry || (hasPendingSerp && !pendingSerp)} onClick={() => { setError(null); setAction(pendingSerp ? "wake" : "retry"); }}>{pendingSerp ? "선택 대기 실행 요청" : "수집하기"}</Button>
        <Button variant="secondary" disabled={!waiting || busy || selecting || !!retry} onClick={() => setAction("cancel")}>선택 대기 취소</Button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {hasPendingSerp && !pendingSerp && <p className="text-xs text-amber-700">대기 SERP 작업은 실패·취소·로컬 항목과 구분해서 선택해 주세요.</p>}
      {notice && <p role="status" className="text-xs text-neutral-600">{notice}</p>}
    </div>
    <Modal open={action !== null} onClose={() => { if (!busy) setAction(null); }}>
      <h2 className="text-lg font-bold">{action === "cancel" ? "대기 수집 취소" : action === "wake" ? "대기 작업 실행 확인" : "수집 시작 확인"}</h2>
      <p className="mt-3 text-sm text-neutral-600">선택한 수집 {selected.length}건 · 기존 엔진·수집 방식·기기 고정</p>
      <ul className="my-4 max-h-48 space-y-2 overflow-y-auto text-xs text-neutral-600">{selected.slice(0, 100).map(item => <li key={item.id}>{({ "google-aio": "Google AIO", "google-ai-mode": "Google AI Mode", "naver-aio": "Naver AIO", "naver-ai": "Naver AI", gemini: "Gemini" } as Record<string, string>)[item.surface] ?? item.surface} · {item.executionKind === "serp-api" ? "SERP API" : "로컬 수집"} · {item.device} · {item.query}</li>)}</ul>
      {selected.length > 100 && <p className="mb-3 text-xs text-neutral-500">미리보기는 100건만 표시합니다. 선택한 전체 {selected.length}건이 처리 대상입니다.</p>}
      <p className="text-xs leading-5 text-neutral-500">{action === "cancel" ? "외부 API에 제출되지 않은 대기 항목만 취소하고 이력을 남깁니다. 이미 제출되었거나 worker가 선점한 작업은 취소할 수 없습니다." : action === "wake" ? "기존 대기 작업에 대해 worker 실행 확인을 요청합니다. 새 수집 요청이나 재제출은 생성하지 않습니다. 큐 순서와 동시 실행 제한을 유지하며, worker가 실행 중이어야 합니다. 선택하지 않은 기존 승인 작업도 정상 큐 순서에 따라 처리됩니다." : `선택 항목을 원본에 연결된 새 요청으로 수집합니다. SERP API는 등록 후 수집 로그에서 확인할 수 있습니다.${hasLocal ? " 로컬 수집은 이전 수집기가 중단됐는지 확인하고, 완료까지 이 화면을 유지해 주세요." : ""}`}</p>
      {action !== "cancel" && <div className="mt-4 flex justify-between rounded-lg bg-slate-50 p-4"><span className="text-sm">SERP API 예상 총액 · {selected.filter(item => item.executionKind === "serp-api").length}회</span><strong>{cost > 0 ? `$${cost.toFixed(4)}` : "-"}</strong></div>}
      {action !== "cancel" && selected.some(item => item.surface === "gemini") && <p className="mt-2 text-xs text-neutral-500">Gemini API 비용은 별도로 발생할 수 있습니다.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {(!selected.length || !validAction) && <p role="alert" className="mt-3 text-xs text-amber-700">선택 작업의 상태가 변경되었습니다. 돌아가서 다시 선택해 주세요.</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>이전</Button><Button disabled={busy || selecting || !selected.length || !validAction} onClick={start}>{busy ? "처리 중…" : action === "cancel" ? "취소 확인" : action === "wake" ? "확인 후 실행 요청" : "확인 후 수집 시작"}</Button></div>
    </Modal>
    {retry?.notice && <p role="alert" className="text-xs text-amber-700">{retry.notice}</p>}
    {retry && <ParallelCollectModal steps={retry.steps} brandId={brandId} orgName={orgName} downloadPlatforms={downloadPlatforms} serverCollector={serverCollector} collectionLogHref={`${base}/collection-runs/${encodeURIComponent(retry.requestId)}`}
      onDone={() => router.refresh()} onClose={() => { const id = retry.requestId; setRetry(null); router.push(`${base}/collection-runs/${encodeURIComponent(id)}`); }} />}
  </EditOnly>;
}
