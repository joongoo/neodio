"use client";

import { useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PROMPT_SURFACES, SURFACE_LABEL, AIO_DAILY_CAP, type PromptSurface } from "@/lib/promptSurfaces";
import { countBySurface, type CollectRow } from "@/lib/collectSteps";

const HINT: Record<PromptSurface, string> = {
  "google-aio": "구글 검색 결과의 AI 개요(AI Overview)를 검색해 YouTube 인용을 기록합니다. 검색 사이에 쉬어 가서 오래 걸립니다.",
  "google-ai-mode": "구글 AI 모드의 답변을 수집합니다.",
  "naver-ai": "네이버 AI 검색(AI 탭)의 답변을 수집합니다.",
};

// "선택 수집" — 고른 프롬프트를 각자 저장된 플랫폼대로 수집한다. 여기서는 어느 플랫폼을 이번에 수집할지만 정하고,
// 플랫폼별 수집은 이어지는 단계로 차례로 진행된다(src/lib/collectSteps.ts).
export function SelectionCollectModal({
  open,
  onClose,
  rows,
  aioDeviceCount,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  rows: CollectRow[];
  aioDeviceCount: number;
  onStart: (enabled: Set<PromptSurface>) => void;
}) {
  const counts = countBySurface(rows);
  const [enabled, setEnabled] = useState<Set<PromptSurface>>(() => new Set(PROMPT_SURFACES.filter((s) => counts[s] > 0)));
  const active = PROMPT_SURFACES.filter((s) => enabled.has(s) && counts[s] > 0);
  const aioSearches = counts["google-aio"] * Math.max(1, aioDeviceCount);

  function toggle(surface: PromptSurface) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(surface)) next.delete(surface);
      else next.add(surface);
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
      <div className="mt-4 flex flex-col gap-1.5">
        {PROMPT_SURFACES.map((surface) => {
          const count = counts[surface];
          return (
            <label
              key={surface}
              className={`flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 ${count === 0 ? "opacity-50" : "cursor-pointer hover:bg-neutral-50"}`}
            >
              <input
                type="checkbox"
                disabled={count === 0}
                checked={enabled.has(surface) && count > 0}
                onChange={() => toggle(surface)}
                className="mt-0.5 size-4 cursor-pointer accent-slate-800"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between text-sm font-medium text-neutral-800">
                  {SURFACE_LABEL[surface]}
                  <span className="text-xs font-bold text-neutral-600">{count}개</span>
                </span>
                <span className="text-xs text-neutral-500">{HINT[surface]}</span>
              </span>
            </label>
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
        <Button variant="primary" disabled={active.length === 0} onClick={() => onStart(new Set(active))}>
          수집 시작
        </Button>
      </div>
    </Modal>
  );
}
