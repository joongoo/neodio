"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { ParallelCollectModal } from "@/components/prompt-library/ParallelCollectModal";
import type { CollectStep } from "@/lib/collectSteps";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import type { RequestItemRow } from "@/lib/backend/dataforseo/requestItems";
import { Modal } from "@/components/ui/Modal";

export function LegacyRetryControl({ requestId, brandId, orgName, base, downloadPlatforms, serverCollector, selected, onChanged }: {
  requestId: string; brandId: string; orgName: string; base: string; downloadPlatforms: CollectorPlatform[]; serverCollector: boolean;
  selected: RequestItemRow[]; onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ requestId: string; steps: CollectStep[] } | null>(null);
  const [action, setAction] = useState<"start" | "retry" | "cancel" | null>(null);
  const waiting = selected.length > 0 && selected.every(item => item.status === "reserved");
  const failed = selected.length > 0 && !waiting;
  async function start() {
    if (!action || !selected.length || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/retry-legacy`, {
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
    <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
      <h2 className="text-sm font-bold text-neutral-900">로컬 수집 {selected.length}건 선택</h2>
      <p className="text-xs leading-5 text-neutral-500">대기 항목은 시작·취소, 실패·중단 항목은 다시 시도할 수 있습니다. 수집 중으로 남은 항목은 이전 수집기를 중단한 후 재시도하세요. 현재 페이지의 선택 항목에만 적용하며, 엔진은 고정됩니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!waiting || busy || !!retry} onClick={() => setAction("start")}>선택 수집 시작</Button>
        <Button variant="secondary" disabled={!failed || busy || !!retry} onClick={() => setAction("retry")}>선택 항목 다시 시도</Button>
        <Button variant="secondary" disabled={!waiting || busy || !!retry} onClick={() => setAction("cancel")}>선택 대기 취소</Button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
    <Modal open={action !== null} onClose={() => { if (!busy) setAction(null); }}>
      <h2 className="text-lg font-bold">{action === "cancel" ? "대기 수집 취소" : "선택 수집 확인"}</h2>
      <p className="mt-3 text-sm text-neutral-600">선택한 로컬 수집 {selected.length}건 · 엔진 변경 불가</p>
      <ul className="my-4 max-h-48 space-y-2 overflow-y-auto text-xs text-neutral-600">{selected.map(item => <li key={item.id}>{({ "google-aio": "Google AIO", "google-ai-mode": "Google AI Mode", "naver-aio": "Naver AIO", "naver-ai": "Naver AI", gemini: "Gemini" } as Record<string, string>)[item.surface] ?? item.surface} · {item.device} · {item.query}</li>)}</ul>
      <p className="text-xs leading-5 text-neutral-500">{action === "cancel" ? "수집하지 않고 취소 이력을 남깁니다." : "선택 항목을 원본과 연결된 새 수집 요청에서 실행합니다. 이전 수집기가 중단됐는지 확인해 주세요. 수집이 끝날 때까지 화면을 유지해 주세요. SERP API 작업은 다시 제출하지 않습니다."}</p>
      {action !== "cancel" && <p className="mt-2 text-xs text-neutral-500">SERP API 예상 비용: -{selected.some(item => item.surface === "gemini") ? " · Gemini API 비용은 별도로 발생할 수 있습니다." : ""}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>돌아가기</Button><Button disabled={busy} onClick={start}>{busy ? "처리 중…" : action === "cancel" ? "취소 확인" : "수집 시작"}</Button></div>
    </Modal>
    {retry && <ParallelCollectModal steps={retry.steps} brandId={brandId} orgName={orgName} downloadPlatforms={downloadPlatforms} serverCollector={serverCollector}
      onDone={() => router.refresh()} onClose={() => { const id = retry.requestId; setRetry(null); router.push(`${base}/collection-runs/${encodeURIComponent(id)}`); }} />}
  </EditOnly>;
}
