"use client";

import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { countBySurface, type CollectRow } from "@/lib/collectSteps";
import { SURFACE_LABEL, type PromptSurface } from "@/lib/promptSurfaces";
import { estimateSerpApiCost, type SerpApiSurface } from "@/lib/dataforseoPricing";

const usd = (value: number) => `$${value.toFixed(4)}`;

export function SerpApiCostConfirmModal({
  rows,
  enabled,
  serpApiEnabled,
  aioDeviceCount,
  onBack,
  onConfirm,
}: {
  rows: CollectRow[];
  enabled: ReadonlySet<PromptSurface>;
  serpApiEnabled: ReadonlySet<SerpApiSurface>;
  aioDeviceCount: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const estimate = estimateSerpApiCost(countBySurface(rows), serpApiEnabled, aioDeviceCount);
  const collectorSurfaces = [...enabled].filter((surface) => !serpApiEnabled.has(surface as SerpApiSurface));

  return (
    <Modal open onClose={onBack}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">수집 시작 확인</h2>
        <ModalCloseButton onClose={onBack} />
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        선택한 <b>{rows.length}개</b> 프롬프트의 수집 방식과 SERP API 예상 조회 금액을 확인하세요.
      </p>

      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
        {estimate.rows.map((row) => (
          <div key={row.surface} className="grid grid-cols-[1fr_auto] gap-4 border-b border-neutral-100 px-3 py-2.5 last:border-b-0">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-neutral-800">{SURFACE_LABEL[row.surface]} · SERP API</span>
              <span className="text-xs text-neutral-500">{row.queries}회 × {usd(row.unitCostUsd)}</span>
            </span>
            <span className="self-center text-sm font-semibold tabular-nums text-neutral-800">{usd(row.estimatedCostUsd)}</span>
          </div>
        ))}
        {collectorSurfaces.length > 0 && (
          <div className="grid grid-cols-[1fr_auto] gap-4 px-3 py-2.5">
            <span className="flex flex-col">
              <span className="text-sm font-medium text-neutral-800">기존 수집 방식</span>
              <span className="text-xs text-neutral-500">{collectorSurfaces.map((surface) => SURFACE_LABEL[surface]).join(" · ")}</span>
            </span>
            <span className="self-center text-sm font-semibold tabular-nums text-neutral-500">$0.0000</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between rounded-lg bg-slate-50 px-4 py-3">
        <span className="flex flex-col">
          <span className="text-xs font-medium text-slate-600">SERP API 예상 총액</span>
          <span className="text-xs text-slate-500">총 {estimate.totalQueries}회 조회</span>
        </span>
        <strong className="text-2xl tabular-nums text-slate-900">{usd(estimate.totalCostUsd)}</strong>
      </div>
      <p className="mt-2 text-xs text-neutral-500">예상 금액이며 실제 청구액은 DataForSEO 응답의 task 비용을 기준으로 기록됩니다.</p>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>이전</Button>
        <Button variant="primary" onClick={onConfirm}>확인 후 수집 시작</Button>
      </div>
    </Modal>
  );
}
