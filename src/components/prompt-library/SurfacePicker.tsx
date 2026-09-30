"use client";

import { PROMPT_SURFACES, SURFACE_LABEL, type PromptSurface } from "@/lib/promptSurfaces";

const SURFACE_HINT: Record<PromptSurface, string> = {
  "google-aio": "구글 검색 결과 맨 위의 AI 개요(AI Overview). 검색 1건이 느리고 하루 수집 상한이 있어 검색어형에 알맞습니다.",
  "google-ai-mode": "구글 AI 모드의 대화형 답변.",
  "naver-aio": "네이버 통합검색 첫 화면의 AI 브리핑. 검색어형에 알맞고, 브리핑이 없는 검색어는 '없음'으로 기록됩니다.",
  "naver-ai": "네이버 AI 검색(AI 탭)의 대화형 답변.",
  gemini: "Gemini의 웹 검색 근거 답변. 이 PC의 수집기 없이 서버가 API로 수집합니다.",
};

const CHIP_SHORT: Record<PromptSurface, string> = { "google-aio": "구글AIO", "google-ai-mode": "구글AI", "naver-aio": "네이버AIO", "naver-ai": "네이버AI", gemini: "Gemini" };

// 프롬프트를 어느 플랫폼에서 수집할지 고르는 체크박스 — 프롬프트 추가·편집 창이 같이 쓴다.
export function SurfacePicker({
  value,
  onChange,
  suggested,
}: {
  value: PromptSurface[];
  onChange: (next: PromptSurface[]) => void;
  /** 문장을 보고 제안한 플랫폼 — 있으면 "추천" 표시를 붙인다. */
  suggested?: PromptSurface[];
}) {
  function toggle(surface: PromptSurface) {
    const next = value.includes(surface) ? value.filter((s) => s !== surface) : [...value, surface];
    onChange(PROMPT_SURFACES.filter((s) => next.includes(s)));
  }
  return (
    <div className="flex flex-col gap-1.5">
      {PROMPT_SURFACES.map((surface) => (
        <label key={surface} className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 hover:bg-neutral-50">
          <input type="checkbox" checked={value.includes(surface)} onChange={() => toggle(surface)} className="mt-0.5 size-4 cursor-pointer accent-slate-800" />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2 text-sm font-medium text-neutral-800">
              {SURFACE_LABEL[surface]}
              {suggested?.includes(surface) && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">추천</span>}
            </span>
            <span className="text-xs text-neutral-500">{SURFACE_HINT[surface]}</span>
          </span>
        </label>
      ))}
      {value.length === 0 && <p className="text-xs text-red-600">수집할 플랫폼을 하나 이상 선택하세요.</p>}
    </div>
  );
}

/** 표에서 쓰는 플랫폼 칩. 플랫폼 정보가 없는 행(목업)은 "—". */
export function SurfaceChips({ surfaces }: { surfaces?: PromptSurface[] }) {
  if (!surfaces || surfaces.length === 0) return <span className="text-neutral-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {surfaces.map((surface) => (
        <span
          key={surface}
          title={SURFACE_LABEL[surface]}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${surface === "google-aio" ? "bg-blue-50 text-blue-700" : "bg-neutral-100 text-neutral-600"}`}
        >
          {CHIP_SHORT[surface]}
        </span>
      ))}
    </span>
  );
}
