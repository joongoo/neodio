"use client";

import { useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PROMPT_SURFACES, SURFACE_LABEL, AIO_DAILY_CAP, type PromptSurface } from "@/lib/promptSurfaces";
import { countBySurface, type CollectRow } from "@/lib/collectSteps";
import { isSerpApiSurface, SERP_API_SURFACES, type SerpApiSurface } from "@/lib/dataforseoPricing";

const HINT: Record<PromptSurface, string> = {
  "google-aio": "구글 검색 결과의 AI 개요(AI Overview)를 검색해 YouTube 인용을 기록합니다. 검색 사이에 쉬어 가서 오래 걸립니다.",
  "google-ai-mode": "구글 AI 모드의 답변을 수집합니다.",
  "naver-aio": "네이버 통합검색 첫 화면의 AI 브리핑을 수집합니다. 수집기 0.4.0 이상이 필요합니다.",
  "naver-ai": "네이버 AI 검색(AI 탭)의 답변을 수집합니다.",
  gemini: "Gemini API로 답변과 출처를 수집합니다(수집기 불필요).",
};

// "선택 수집" — 고른 프롬프트를 각자 저장된 플랫폼대로 수집한다. 여기서는 어느 플랫폼을 이번에 수집할지만 정하고,
// 플랫폼별 수집은 이어지는 단계로 차례로 진행된다(src/lib/collectSteps.ts).
export function SelectionCollectModal({
  open,
  onClose,
  rows,
  aioDeviceCount,
  initialEnabled,
  initialSerpApiEnabled,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  rows: CollectRow[];
  aioDeviceCount: number;
  initialEnabled?: ReadonlySet<PromptSurface>;
  initialSerpApiEnabled?: ReadonlySet<SerpApiSurface>;
  onReview: (enabled: Set<PromptSurface>, serpApiEnabled: Set<SerpApiSurface>) => void;
}) {
  const counts = countBySurface(rows);
  const [enabled, setEnabled] = useState<Set<PromptSurface>>(() => new Set(initialEnabled ?? PROMPT_SURFACES.filter((s) => counts[s] > 0)));
  const [serpApiEnabled, setSerpApiEnabled] = useState<Set<SerpApiSurface>>(() => new Set(initialSerpApiEnabled));
  const active = PROMPT_SURFACES.filter((s) => enabled.has(s) && counts[s] > 0);
  const aioSearches = counts["google-aio"] * Math.max(1, aioDeviceCount);
  const eligibleSerpSurfaces = SERP_API_SURFACES.filter((surface) => enabled.has(surface) && counts[surface] > 0);
  const allSerpEnabled = eligibleSerpSurfaces.length > 0 && eligibleSerpSurfaces.every((surface) => serpApiEnabled.has(surface));

  function toggle(surface: PromptSurface) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(surface)) {
        next.delete(surface);
        if (isSerpApiSurface(surface)) setSerpApiEnabled((current) => {
          const updated = new Set(current);
          updated.delete(surface);
          return updated;
        });
      }
      else next.add(surface);
      return next;
    });
  }

  function toggleSerpApi(surface: SerpApiSurface) {
    setSerpApiEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(surface)) next.delete(surface);
      else next.add(surface);
      return next;
    });
  }

  function toggleAllSerpApi() {
    setSerpApiEnabled((prev) => {
      const next = new Set(prev);
      for (const surface of eligibleSerpSurfaces) {
        if (allSerpEnabled) next.delete(surface);
        else next.add(surface);
      }
      return next;
    });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">선택한 프롬프트 수집</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        선택한 <b>{rows.length}개</b> 프롬프트를 각자 저장된 플랫폼에서 수집합니다. 플랫폼별로 차례로 진행되며, 플랫폼은 &quot;플랫폼 변경&quot;이나 행의 편집에서 바꿀 수 있습니다.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-slate-800">SERP API 일괄 사용</span>
          <span className="text-xs text-slate-500">구글AIO·구글AI·네이버AIO에만 적용됩니다.</span>
        </span>
        <Switch checked={allSerpEnabled} disabled={eligibleSerpSurfaces.length === 0} label="SERP API 일괄 사용" onChange={toggleAllSerpApi} />
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {PROMPT_SURFACES.map((surface) => {
          const count = counts[surface];
          const canUseSerpApi = isSerpApiSurface(surface);
          return (
            <div
              key={surface}
              className={`flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 ${count === 0 ? "opacity-50" : "cursor-pointer hover:bg-neutral-50"}`}
            >
              <input
                aria-label={`${SURFACE_LABEL[surface]} 수집`}
                type="checkbox"
                disabled={count === 0}
                checked={enabled.has(surface) && count > 0}
                onChange={() => toggle(surface)}
                className="mt-0.5 size-4 cursor-pointer accent-slate-800"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between text-sm font-medium text-neutral-800">
                  {SURFACE_LABEL[surface]}
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-600">{count}개</span>
                    {canUseSerpApi && (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        SERP API
                        <Switch
                          checked={serpApiEnabled.has(surface)}
                          disabled={count === 0 || !enabled.has(surface)}
                          label={`${SURFACE_LABEL[surface]} SERP API 사용`}
                          onChange={() => toggleSerpApi(surface)}
                        />
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">{HINT[surface]}</span>
              </span>
            </div>
          );
        })}
      </div>
      {enabled.has("google-aio") && aioSearches > AIO_DAILY_CAP && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          AIO 검색이 {aioSearches}회로, 하루 권장 상한({AIO_DAILY_CAP}회)을 넘습니다. 캡차가 뜨면 그 자리에서 멈춥니다.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" disabled={active.length === 0} onClick={() => onReview(new Set(active), new Set(serpApiEnabled))}>
          다음
        </Button>
      </div>
    </Modal>
  );
}

function Switch({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-slate-800" : "bg-neutral-300"} disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer`}
    >
      <span className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}
