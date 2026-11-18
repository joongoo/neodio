"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { ParallelCollectModal } from "@/components/prompt-library/ParallelCollectModal";
import type { CollectStep } from "@/lib/collectSteps";
import type { CollectorPlatform } from "@/lib/collectorAgent";

export function LegacyRetryControl({ requestId, brandId, orgName, base, downloadPlatforms, serverCollector }: {
  requestId: string; brandId: string; orgName: string; base: string; downloadPlatforms: CollectorPlatform[]; serverCollector: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ requestId: string; steps: CollectStep[] } | null>(null);
  async function start() {
    if (!window.confirm("완료되지 않은 레거시 항목만 새 요청에서 다시 수집할까요? 이전 수집기가 중단됐는지 확인해 주세요. 완료 항목과 SERP API 작업은 다시 제출하지 않습니다. Gemini 항목이 포함되면 API 비용이 추가로 발생할 수 있습니다.")) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/retry-legacy`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: crypto.randomUUID(), confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "재시도 요청을 등록하지 못했습니다.");
      setRetry(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "재시도를 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <EditOnly>
    <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3">
      <h2 className="text-sm font-bold text-neutral-900">미완료 레거시 수집</h2>
      <p className="text-xs leading-5 text-neutral-500">이탈·중단으로 완료되지 않은 항목은 직접 다시 시도할 수 있습니다. SERP API 작업은 영향을 받지 않습니다.</p>
      <Button variant="secondary" disabled={busy || !!retry} onClick={start}>{busy ? "등록 중…" : "레거시 미완료 항목 다시 시도"}</Button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
    {retry && <ParallelCollectModal steps={retry.steps} brandId={brandId} orgName={orgName} downloadPlatforms={downloadPlatforms} serverCollector={serverCollector}
      onDone={() => router.refresh()} onClose={() => { const id = retry.requestId; setRetry(null); router.push(`${base}/collection-runs/${encodeURIComponent(id)}`); }} />}
  </EditOnly>;
}
