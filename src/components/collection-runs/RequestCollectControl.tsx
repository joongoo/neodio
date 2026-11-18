"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { ParallelCollectModal } from "@/components/prompt-library/ParallelCollectModal";
import type { CollectStep } from "@/lib/collectSteps";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import { retrySelectionCost, type RetrySelectionItem } from "@/lib/requestRetrySelection";
import { Modal } from "@/components/ui/Modal";

export function RequestCollectControl({ requestId, brandId, orgName, base, downloadPlatforms, serverCollector, selected, onChanged, onSelectFailures, selecting }: {
  requestId: string; brandId: string; orgName: string; base: string; downloadPlatforms: CollectorPlatform[]; serverCollector: boolean;
  selected: RetrySelectionItem[]; onChanged: () => void; onSelectFailures: () => void; selecting: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ requestId: string; steps: CollectStep[]; notice?: string | null } | null>(null);
  const [action, setAction] = useState<"retry" | "cancel" | null>(null);
  const waiting = selected.length > 0 && selected.every(item => item.executionKind === "legacy" && item.status === "reserved");
  const cost = retrySelectionCost(selected);
  const hasLocal = selected.some(item => item.executionKind === "legacy");
  async function start() {
    if (!action || !selected.length || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/${action === "cancel" ? "retry-legacy" : "retry"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), confirmed: true, action, itemIds: selected.map(item => item.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "재시도 요청을 등록하지 못했습니다.");
      setAction(null);
      if (action === "cancel") { onChanged(); router.refresh(); }
      else setRetry(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "재시도를 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <EditOnly>
    <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={selecting || busy || !!retry} onClick={onSelectFailures}>{selecting ? "선택 중…" : "실패 항목 전체 선택"}</Button>
        <span className="mr-auto text-xs text-neutral-500">{selected.length}건 선택 · 로컬 / SERP API · 엔진 고정</span>
        <Button disabled={!selected.length || busy || selecting || !!retry} onClick={() => { setError(null); setAction("retry"); }}>수집하기</Button>
        <Button variant="secondary" disabled={!waiting || busy || !!retry} onClick={() => setAction("cancel")}>선택 대기 취소</Button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
    <Modal open={action !== null} onClose={() => { if (!busy) setAction(null); }}>
      <h2 className="text-lg font-bold">{action === "cancel" ? "대기 수집 취소" : "수집 시작 확인"}</h2>
      <p className="mt-3 text-sm text-neutral-600">선택한 수집 {selected.length}건 · 기존 엔진·수집 방식·기기 고정</p>
      <ul className="my-4 max-h-48 space-y-2 overflow-y-auto text-xs text-neutral-600">{selected.map(item => <li key={item.id}>{({ "google-aio": "Google AIO", "google-ai-mode": "Google AI Mode", "naver-aio": "Naver AIO", "naver-ai": "Naver AI", gemini: "Gemini" } as Record<string, string>)[item.surface] ?? item.surface} · {item.executionKind === "serp-api" ? "SERP API" : "로컬 수집"} · {item.device} · {item.query}</li>)}</ul>
      <p className="text-xs leading-5 text-neutral-500">{action === "cancel" ? "수집하지 않고 취소 이력을 남깁니다." : `선택 항목을 원본에 연결된 새 요청으로 수집합니다. SERP API는 등록 후 수집 로그에서 확인할 수 있습니다.${hasLocal ? " 로컬 수집은 이전 수집기가 중단됐는지 확인하고, 완료까지 이 화면을 유지해 주세요." : ""}`}</p>
      {action !== "cancel" && <div className="mt-4 flex justify-between rounded-lg bg-slate-50 p-4"><span className="text-sm">SERP API 예상 총액 · {selected.filter(item => item.executionKind === "serp-api").length}회</span><strong>{cost > 0 ? `$${cost.toFixed(4)}` : "-"}</strong></div>}
      {action !== "cancel" && selected.some(item => item.surface === "gemini") && <p className="mt-2 text-xs text-neutral-500">Gemini API 비용은 별도로 발생할 수 있습니다.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>이전</Button><Button disabled={busy} onClick={start}>{busy ? "처리 중…" : action === "cancel" ? "취소 확인" : "확인 후 수집 시작"}</Button></div>
    </Modal>
    {retry?.notice && <p role="alert" className="text-xs text-amber-700">{retry.notice}</p>}
    {retry && <ParallelCollectModal steps={retry.steps} brandId={brandId} orgName={orgName} downloadPlatforms={downloadPlatforms} serverCollector={serverCollector} collectionLogHref={`${base}/collection-runs/${encodeURIComponent(retry.requestId)}`}
      onDone={() => router.refresh()} onClose={() => { const id = retry.requestId; setRetry(null); router.push(`${base}/collection-runs/${encodeURIComponent(id)}`); }} />}
  </EditOnly>;
}
