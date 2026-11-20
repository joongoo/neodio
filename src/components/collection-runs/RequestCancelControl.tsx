"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";

export function RequestCancelControl({ request }: { request: RequestLogRow }) {
  const canEdit = useCanEdit(), router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  if (!canEdit || request.cancelRequested || requested || !(request.counts.waiting + request.counts.running + request.counts.attention)) return null;
  const cancel = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(request.id)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      if (!response.ok) throw new Error("취소 요청을 저장하지 못했습니다. 다시 시도해 주세요.");
      setOpen(false); setRequested(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "취소 요청에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="secondary" size="sm" onClick={() => { setError(""); setOpen(true); }}>취소하기</Button>
    <Modal open={open} onClose={() => { if (!busy) setOpen(false); }}>
      <h2 className="text-lg font-semibold">수집 요청 전체를 취소할까요?</h2>
      <p className="mt-3 text-sm leading-6 text-neutral-600">아직 제출하지 않은 SERP API 작업은 취소합니다. 이미 제출된 작업은 결과 회수를 계속하며, 그동안 ‘취소 중’으로 표시합니다. 기존 수집 결과와 발생한 비용은 유지됩니다.</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">로컬 수집에는 실행 화면을 통해 취소 신호를 전달합니다(통상 10초 이내). 이미 실행 중인 작업은 즉시 종료되지 않을 수 있습니다. 취소한 요청은 확인 필요 대상에서 제외합니다.</p>
      {request.surfaces.includes("gemini") && <p className="mt-2 text-sm leading-6 text-neutral-600">Gemini는 아직 보내지 않은 작업을 취소합니다. 이미 전송한 답변은 결과가 도착하면 저장합니다.</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button disabled={busy} onClick={() => setOpen(false)}>돌아가기</Button><Button variant="primary" disabled={busy} onClick={() => void cancel()}>{busy ? "처리 중…" : "요청 전체 취소"}</Button></div>
    </Modal>
  </>;
}
