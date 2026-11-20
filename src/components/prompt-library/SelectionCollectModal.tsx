"use client";

import { useEffect, useState } from "react";
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
  gemini: "서버에서 최대 3건씩 동시에 수집합니다. 등록 후 진행 상황과 결과는 수집 요청 로그에서 확인합니다.",
};

// "선택 수집" — 고른 프롬프트를 각자 저장된 플랫폼대로 수집한다. 여기서는 어느 플랫폼을 이번에 수집할지만 정하고,
// 플랫폼별 수집 단계와 서버 작업 등록은 collectSteps.ts에서 구성한다.
export function SelectionCollectModal({
  open,
  onClose,
  rows,
  brandId,
  aioDeviceCount,
  initialEnabled,
  initialSerpApiEnabled,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  rows: CollectRow[];
  brandId?: string;
  aioDeviceCount: number;
  initialEnabled?: ReadonlySet<PromptSurface>;
  initialSerpApiEnabled?: ReadonlySet<SerpApiSurface>;
  onReview: (enabled: Set<PromptSurface>, serpApiEnabled: Set<SerpApiSurface>) => void;
}) {
  const counts = countBySurface(rows);
  const [enabled, setEnabled] = useState<Set<PromptSurface>>(() => new Set(initialEnabled ?? PROMPT_SURFACES.filter((s) => counts[s] > 0)));
  const [serpApiEnabled, setSerpApiEnabled] = useState<Set<SerpApiSurface>>(() => new Set(initialSerpApiEnabled));
  const [activeSerpCounts, setActiveSerpCounts] = useState<Partial<Record<SerpApiSurface, number>>>({});
  const active = PROMPT_SURFACES.filter((s) => enabled.has(s) && counts[s] > 0);
  const aioSearches = counts["google-aio"] * Math.max(1, aioDeviceCount);
  const eligibleSerpSurfaces = SERP_API_SURFACES.filter((surface) => enabled.has(surface) && counts[surface] > 0);
  const allSerpEnabled = eligibleSerpSurfaces.length > 0 && eligibleSerpSurfaces.every((surface) => serpApiEnabled.has(surface));

  useEffect(() => {
    if (!open || !brandId || rows.length === 0) return;
    const controller = new AbortController();
    void fetch("/api/dataforseo/tasks/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId,
        prompts: rows.map((row) => ({ promptId: row.promptId, query: row.prompt })),
        surfaces: SERP_API_SURFACES,
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as {
        tasks?: { promptId: string | null; query: string; surface: SerpApiSurface }[];
      };
      const promptsBySurface = new Map<SerpApiSurface, Set<string>>();
      for (const task of data.tasks ?? []) {
        const prompts = promptsBySurface.get(task.surface) ?? new Set<string>();
        prompts.add(task.promptId ?? task.query);
        promptsBySurface.set(task.surface, prompts);
      }
      setActiveSerpCounts(Object.fromEntries([...promptsBySurface].map(([surface, prompts]) => [surface, prompts.size])));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [brandId, open, rows]);

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
        선택한 <b>{rows.length}개</b> 프롬프트를 각자 저장된 플랫폼에서 수집합니다. Gemini와 SERP API는 작업 등록 후 수집 요청 로그에서 진행 상황을 확인할 수 있습니다. 플랫폼은 &quot;플랫폼 변경&quot;이나 행의 편집에서 바꿀 수 있습니다.
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
          const activeCount = canUseSerpApi ? activeSerpCounts[surface] ?? 0 : 0;
          return (
            <div
              key={surface}
              onClick={() => { if (count > 0) toggle(surface); }}
              className={`flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 ${count === 0 ? "opacity-50" : "cursor-pointer hover:bg-neutral-50"}`}
            >
              <input
                aria-label={`${SURFACE_LABEL[surface]} 수집`}
                type="checkbox"
                disabled={count === 0}
                checked={enabled.has(surface) && count > 0}
                onChange={() => toggle(surface)}
                onClick={(event) => event.stopPropagation()}
                className="mt-0.5 size-4 cursor-pointer accent-slate-800"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-800">
                  <span>{SURFACE_LABEL[surface]}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600">{count}개</span>
                  {activeCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">수집 중 {activeCount}개</span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">{HINT[surface]}</span>
                {canUseSerpApi && (
                  <span className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs font-medium text-slate-600">
                    <span>SERP API로 수집</span>
                    <Switch
                      checked={serpApiEnabled.has(surface)}
                      disabled={count === 0 || !enabled.has(surface)}
                      label={`${SURFACE_LABEL[surface]} SERP API 사용`}
                      onChange={() => toggleSerpApi(surface)}
                    />
                  </span>
                )}
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
