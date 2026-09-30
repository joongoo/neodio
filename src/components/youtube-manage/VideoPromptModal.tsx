"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PROMPT_SURFACES, SURFACE_LABEL, suggestSurfaces, type PromptSurface } from "@/lib/promptSurfaces";
import {
  MAX_VIDEOS_PER_REQUEST,
  buildVideoPromptRequest,
  parseVideoPromptSuggestions,
  type VideoForSuggestion,
} from "@/lib/videoPromptSuggestion";

const SURFACE_SHORT: Record<PromptSurface, string> = { "google-aio": "구글AIO", "google-ai-mode": "구글AI", "naver-ai": "네이버AI" };

interface ReviewItem {
  key: string;
  videoId: string;
  text: string;
  surfaces: PromptSurface[];
  include: boolean;
}

// 체크한 영상의 "예상 프롬프트" 만들기 — AI가 영상 제목·설명을 보고 이 영상이 답이 될 질문을 만들고(붙여넣기도 가능),
// 사람이 고른 것만 프롬프트 라이브러리에 등록한다. 플랫폼은 프롬프트마다 고른다(기본은 문장 모양으로 추천).
export function VideoPromptModal({
  open,
  onClose,
  brandId,
  brandName,
  industry,
  candidates,
  existingPrompts,
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  brandId: string;
  brandName: string;
  industry: string;
  /** 체크된 영상 — 예상 프롬프트가 없는 영상이 앞에 오도록 정렬해서 넘긴다. */
  candidates: (VideoForSuggestion & { thumbnailUrl: string; promptCount: number })[];
  existingPrompts: string[];
  onRegistered: (count: number) => void;
}) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [selected, setSelected] = useState<string[]>(() => candidates.slice(0, MAX_VIDEOS_PER_REQUEST).map((v) => v.videoId));
  const [perVideo, setPerVideo] = useState(4);
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);

  const chosen = useMemo(() => candidates.filter((v) => selected.includes(v.videoId)), [candidates, selected]);
  const input = useMemo(
    () => ({ brandName, industry: industry || undefined, videos: chosen, perVideo, existingPrompts }),
    [brandName, industry, chosen, perVideo, existingPrompts]
  );
  const promptText = useMemo(() => buildVideoPromptRequest(input), [input]);

  function close() {
    setStep("input");
    setPasted("");
    setError(null);
    setItems([]);
    setGenerating(false);
    setRegistering(false);
    onClose();
  }

  function toggleVideo(videoId: string) {
    setSelected((prev) => {
      if (prev.includes(videoId)) return prev.filter((id) => id !== videoId);
      return prev.length >= MAX_VIDEOS_PER_REQUEST ? prev : [...prev, videoId];
    });
  }

  function review(raw: string) {
    const parsed = parseVideoPromptSuggestions(raw, input);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setDroppedCount(parsed.droppedCount);
    setItems(
      chosen.flatMap((video) =>
        (parsed.byVideo[video.videoId] ?? []).map((text, i) => ({
          key: `${video.videoId}:${i}`,
          videoId: video.videoId,
          text,
          surfaces: suggestSurfaces(text),
          include: true,
        }))
      )
    );
    setStep("review");
  }

  async function runAi() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/llm-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "자동 생성하지 못했습니다. 아래에서 직접 붙여넣을 수 있습니다.");
        return;
      }
      setPasted(body.text);
      review(body.text);
    } catch {
      setError("자동 생성하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setGenerating(false);
    }
  }

  function patch(key: string, change: Partial<ReviewItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  function toggleSurface(item: ReviewItem, surface: PromptSurface) {
    const next = item.surfaces.includes(surface) ? item.surfaces.filter((s) => s !== surface) : [...item.surfaces, surface];
    patch(item.key, { surfaces: PROMPT_SURFACES.filter((s) => next.includes(s)) });
  }

  const accepted = items.filter((item) => item.include && item.text.trim());
  const invalid = accepted.some((item) => item.surfaces.length === 0);

  async function register() {
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube-manage/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, prompts: accepted.map(({ videoId, text, surfaces }) => ({ videoId, text, surfaces })) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "등록하지 못했습니다.");
        return;
      }
      onRegistered(body.registered);
      close();
    } catch {
      setError("등록하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">예상 프롬프트 만들기</h2>
        </div>
        <ModalCloseButton onClose={close} />
      </div>

      {step === "input" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            체크한 영상의 제목·설명을 AI가 보고, 이 영상이 답이 될 만한 질문을 만듭니다. 만든 프롬프트는 확인하고 고른 것만 프롬프트 라이브러리에 등록되고, 선택한 플랫폼에서 수집됩니다.
          </p>
          {candidates.length === 0 ? (
            <p className="mt-4 rounded-md bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500">먼저 목록에서 영상을 체크하세요.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-700">
                    대상 영상 ({chosen.length}/{MAX_VIDEOS_PER_REQUEST})
                  </span>
                  {candidates.length > MAX_VIDEOS_PER_REQUEST && (
                    <span className="text-[11px] text-neutral-500">한 번에 최대 {MAX_VIDEOS_PER_REQUEST}개까지 만듭니다. 등록한 뒤 다시 열어 나머지를 만드세요.</span>
                  )}
                </div>
                <div className="flex max-h-44 flex-col overflow-y-auto rounded-md border border-neutral-200">
                  {candidates.map((video) => {
                    const on = selected.includes(video.videoId);
                    return (
                      <label
                        key={video.videoId}
                        className={cn("flex cursor-pointer items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-b-0 hover:bg-neutral-50", !on && selected.length >= MAX_VIDEOS_PER_REQUEST && "opacity-50")}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleVideo(video.videoId)} className="size-4 cursor-pointer accent-slate-800" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={video.thumbnailUrl} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />
                        <span className="min-w-0 flex-1 truncate text-xs text-neutral-800">{video.title}</span>
                        {video.promptCount > 0 && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">프롬프트 {video.promptCount}개</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-neutral-700">
                <span className="font-bold">영상당 개수</span>
                <select value={perVideo} onChange={(e) => setPerVideo(Number(e.target.value))} className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs">
                  {[3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}개
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-2 text-xs text-slate-700">
                  {generating ? (
                    <>
                      <Loader2 size={14} className="shrink-0 animate-spin" />
                      <span>AI가 예상 프롬프트를 만드는 중입니다… 보통 10~30초 걸립니다. 창을 닫지 마세요.</span>
                    </>
                  ) : (
                    <span>버튼을 누르면 AI가 영상별 예상 프롬프트를 만듭니다.</span>
                  )}
                </p>
                <button
                  type="button"
                  disabled={generating || chosen.length === 0}
                  onClick={() => void runAi()}
                  className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-60"
                >
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                  {generating ? "생성하는 중..." : "AI로 자동 생성"}
                </button>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-neutral-700">직접 하려면: 프롬프트를 복사해 LLM에 붙여넣고 답변을 가져오세요</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(promptText);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "복사됨" : "복사"}
                    </button>
                  </div>
                  <textarea readOnly value={promptText} rows={6} className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600" />
                  <textarea
                    value={pasted}
                    onChange={(e) => {
                      setPasted(e.target.value);
                      setError(null);
                    }}
                    rows={5}
                    placeholder="여기에 LLM의 JSON 답변을 붙여넣으세요"
                    className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
                  />
                </div>
              </details>
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            {candidates.length > 0 && (
              <Button variant="primary" disabled={!pasted.trim() || generating} onClick={() => review(pasted)}>
                결과 검토하기
              </Button>
            )}
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            등록할 프롬프트만 체크하세요. 문장은 고칠 수 있고, 플랫폼은 프롬프트마다 고릅니다.
            {droppedCount > 0 && <span className="ml-1 text-amber-700">(중복이거나 형식이 맞지 않는 {droppedCount}개는 제외했습니다)</span>}
          </p>
          <div className="mt-3 flex max-h-[52vh] flex-col gap-4 overflow-y-auto pr-1">
            {chosen
              .filter((video) => items.some((item) => item.videoId === video.videoId))
              .map((video) => (
                <div key={video.videoId} className="flex flex-col gap-1.5">
                  <span className="truncate text-xs font-bold text-neutral-800">{video.title}</span>
                  {items
                    .filter((item) => item.videoId === video.videoId)
                    .map((item) => (
                      <div key={item.key} className="flex flex-col gap-1.5 rounded-md border border-neutral-200 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={item.include} onChange={(e) => patch(item.key, { include: e.target.checked })} className="size-4 cursor-pointer accent-slate-800" />
                          <input
                            value={item.text}
                            onChange={(e) => patch(item.key, { text: e.target.value })}
                            aria-label="프롬프트"
                            className="min-w-0 flex-1 rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-800"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-6">
                          {PROMPT_SURFACES.map((surface) => {
                            const on = item.surfaces.includes(surface);
                            return (
                              <button
                                key={surface}
                                type="button"
                                title={SURFACE_LABEL[surface]}
                                aria-pressed={on}
                                onClick={() => toggleSurface(item, surface)}
                                className={cn(
                                  "rounded px-2 py-0.5 text-[11px] font-bold cursor-pointer",
                                  on ? "bg-slate-800 text-white" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                                )}
                              >
                                {SURFACE_SHORT[surface]}
                              </button>
                            );
                          })}
                          {item.include && item.surfaces.length === 0 && <span className="text-[11px] text-red-600">플랫폼을 하나 이상 선택하세요</span>}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep("input")} disabled={registering}>
              이전
            </Button>
            <Button variant="primary" disabled={accepted.length === 0 || invalid || registering} onClick={() => void register()}>
              {registering ? "등록하는 중..." : `${accepted.length}개 프롬프트 등록`}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
