"use client";

import { useState } from "react";
import { Copy, Check, Sparkles, Trash2, Pencil, ShieldCheck } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PromptLibraryRow } from "@/lib/db";

type Action = "keep" | "delete" | "modify";

interface Recommendation {
  id: string;
  action: Action;
  reason?: string;
  prompt?: string;
  category?: string;
  topic?: string;
}

interface ParsedResult {
  /** id가 라이브러리에 없거나 스키마를 벗어나 버려진 항목 수 — 검토 화면에 경고로 보여준다. */
  droppedCount: number;
  recommendations: Recommendation[];
}

const VALID_ACTIONS = new Set<Action>(["keep", "delete", "modify"]);

function buildPromptText(rows: PromptLibraryRow[]): string {
  const dump = rows.map((r) => `${r.id}\t${r.category}\t${r.topic}\t${r.prompt}`).join("\n");
  return `다음은 우리 프롬프트 라이브러리 전체입니다 (형식: id\\t카테고리\\t토픽\\t프롬프트 원문, 총 ${rows.length}개):\n\n${dump}\n\n각 프롬프트를 검토해서 다음 중 하나로 판단해주세요:\n- keep: 그대로 유지할 것 (좋은 프롬프트)\n- delete: 삭제 권장 (중복, 브랜드명이 과도하게 들어감, 의도가 불분명, 실효성이 낮음 등)\n- modify: 문구/카테고리/토픽을 다듬으면 더 좋아질 것\n\n반드시 라이브러리의 모든 ${rows.length}개 id 각각에 대해 정확히 하나의 항목을 포함한 JSON 배열로만 답변하세요. 다른 설명은 쓰지 마세요.\n\n각 항목의 형식:\n{"id": "위 목록의 id 그대로", "action": "keep | delete | modify", "reason": "이 판단의 짧은 이유(한 문장)", "prompt": "action이 modify일 때만, 수정된 프롬프트 전문", "category": "action이 modify이고 카테고리를 바꿀 때만", "topic": "action이 modify이고 토픽을 바꿀 때만"}\n\nkeep 항목에는 prompt/category/topic을 넣지 마세요. modify 항목은 prompt/category/topic 중 실제로 바뀌는 필드만 넣어도 됩니다(안 바뀌는 필드는 생략).`;
}

function parseResponse(raw: string, rows: PromptLibraryRow[]): ParsedResult | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // LLM이 설명을 덧붙였을 수 있으니 첫 '['부터 마지막 ']'까지만 다시 시도한다.
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) return { error: "JSON 배열로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { error: "JSON 배열로 해석할 수 없습니다. LLM이 JSON만 답하도록 다시 시도해주세요." };
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "빈 배열이거나 배열이 아닙니다." };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const recommendations: Recommendation[] = [];
  let dropped = 0;

  for (const item of parsed) {
    const it = item as Record<string, unknown>;
    const id = typeof it?.id === "string" ? it.id : "";
    const action = typeof it?.action === "string" ? (it.action as Action) : undefined;
    if (!id || !byId.has(id) || !action || !VALID_ACTIONS.has(action)) {
      dropped += 1;
      continue;
    }
    if (action === "modify") {
      const row = byId.get(id)!;
      const prompt = typeof it.prompt === "string" && it.prompt.trim() ? it.prompt.trim() : row.prompt;
      const category = typeof it.category === "string" && it.category.trim() ? it.category.trim() : row.category;
      const topic = typeof it.topic === "string" && it.topic.trim() ? it.topic.trim() : row.topic;
      // 실제로 바뀌는 게 하나도 없으면 keep과 다를 게 없다 — 검토 목록을 깔끔하게 유지.
      if (prompt === row.prompt && category === row.category && topic === row.topic) continue;
      recommendations.push({ id, action, reason: typeof it.reason === "string" ? it.reason : undefined, prompt, category, topic });
    } else if (action === "delete") {
      recommendations.push({ id, action, reason: typeof it.reason === "string" ? it.reason : undefined });
    }
    // keep은 검토 목록에 넣지 않는다 — 액션이 필요 없으므로.
  }

  if (recommendations.length === 0) return { error: "적용할 만한 변경 권장(삭제/수정)이 없습니다 — 전부 유지 권장이거나 형식을 인식하지 못했습니다." };
  return { droppedCount: dropped, recommendations };
}

// "전체 복붙 → 추천 받기 → 추천 붙여넣기 → 반영" 흐름의 프롬프트 라이브러리
// 전용 브릿지. LlmBridgeModal과 달리 결과를 별도 저장소에 두지 않고, 검토
// 후 선택된 항목만 기존 /api/tracked-topics(PATCH/DELETE)로 라이브러리
// 자체를 직접 갱신한다 — 삭제가 섞여있어 되돌리기 어려우므로 검토 단계를 둔다.
export function PromptLibraryOptimizeModal({
  open,
  onClose,
  rows,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  rows: PromptLibraryRow[];
  /** 반영된 삭제 id 목록과 수정된 행 목록 — 부모가 로컬 state에 그대로 반영한다. */
  onApplied: (result: { deletedIds: string[]; updatedRows: PromptLibraryRow[] }) => void;
}) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const promptText = buildPromptText(rows);

  function close() {
    setStep("input");
    setPasted("");
    setParseError(null);
    setDroppedCount(0);
    setRecommendations([]);
    setChecked(new Set());
    setApplying(false);
    setApplyError(null);
    onClose();
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goToReview() {
    const result = parseResponse(pasted, rows);
    if ("error" in result) {
      setParseError(result.error);
      return;
    }
    setParseError(null);
    setDroppedCount(result.droppedCount);
    setRecommendations(result.recommendations);
    setChecked(new Set(result.recommendations.map((r) => r.id)));
    setStep("review");
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    const accepted = recommendations.filter((r) => checked.has(r.id));
    if (accepted.length === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const deletedIds: string[] = [];
      const updatedRows: PromptLibraryRow[] = [];
      const byId = new Map(rows.map((r) => [r.id, r]));

      const results = await Promise.all(
        accepted.map(async (rec) => {
          if (rec.action === "delete") {
            const res = await fetch(`/api/tracked-topics?id=${encodeURIComponent(rec.id)}`, { method: "DELETE" });
            return { rec, ok: res.ok };
          }
          const res = await fetch(`/api/tracked-topics?id=${encodeURIComponent(rec.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: rec.prompt, category: rec.category, topic: rec.topic }),
          });
          const data = await res.json().catch(() => null);
          return { rec, ok: res.ok && data?.ok, row: data?.row as PromptLibraryRow | undefined };
        })
      );

      const failed: string[] = [];
      for (const r of results) {
        if (!r.ok) {
          failed.push(byId.get(r.rec.id)?.prompt ?? r.rec.id);
          continue;
        }
        if (r.rec.action === "delete") deletedIds.push(r.rec.id);
        else if (r.row) updatedRows.push(r.row);
      }

      onApplied({ deletedIds, updatedRows });
      if (failed.length > 0) {
        setApplyError(`${failed.length}개 항목은 반영하지 못했습니다: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? " 외" : ""}`);
        setApplying(false);
        return;
      }
      close();
    } finally {
      setApplying(false);
    }
  }

  const deleteCount = recommendations.filter((r) => r.action === "delete" && checked.has(r.id)).length;
  const modifyCount = recommendations.filter((r) => r.action === "modify" && checked.has(r.id)).length;

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">프롬프트 라이브러리 최적화</h2>
        </div>
        <ModalCloseButton onClose={close} />
      </div>

      {step === "input" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            라이브러리 전체({rows.length}개)를 LLM에게 보내 유지/삭제/수정을 추천받고, 그 답변을 다시 붙여넣으면 검토 후 라이브러리에 반영합니다.
          </p>

          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-700">1. 아래 프롬프트를 복사해 LLM(ChatGPT 등)에 붙여넣으세요</span>
              <button
                type="button"
                onClick={copyPrompt}
                className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
            <textarea
              readOnly
              value={promptText}
              rows={7}
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600"
            />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-bold text-neutral-700">2. LLM의 답변(JSON)을 그대로 붙여넣으세요</span>
            <textarea
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setParseError(null);
              }}
              rows={7}
              placeholder="여기에 LLM 답변을 붙여넣으세요"
              className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
            />
          </div>

          {parseError && <p className="mt-2 text-xs text-red-600">{parseError}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            <Button variant="primary" disabled={!pasted.trim()} onClick={goToReview}>
              추천 검토하기
            </Button>
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            삭제 {recommendations.filter((r) => r.action === "delete").length}건, 수정 {recommendations.filter((r) => r.action === "modify").length}건이
            추천됐습니다. 반영할 항목만 선택하세요 — 체크 해제한 항목은 그대로 유지됩니다.
            {droppedCount > 0 && ` (라이브러리에 없는 id 등 인식하지 못한 항목 ${droppedCount}개는 제외했습니다.)`}
          </p>

          <div className="mt-3 max-h-[360px] overflow-y-auto rounded-md border border-neutral-200">
            {recommendations.map((rec) => {
              const row = rows.find((r) => r.id === rec.id);
              return (
                <label
                  key={rec.id}
                  className="flex cursor-pointer items-start gap-2.5 border-b border-neutral-100 p-3 last:border-b-0 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(rec.id)}
                    onChange={() => toggle(rec.id)}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-slate-800"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      {rec.action === "delete" ? (
                        <Trash2 size={12} className="shrink-0 text-red-600" />
                      ) : (
                        <Pencil size={12} className="shrink-0 text-amber-600" />
                      )}
                      <span className={`text-[11px] font-bold ${rec.action === "delete" ? "text-red-600" : "text-amber-600"}`}>
                        {rec.action === "delete" ? "삭제 권장" : "수정 권장"}
                      </span>
                    </div>
                    <p className="truncate text-sm text-neutral-800">{row?.prompt ?? rec.id}</p>
                    {rec.action === "modify" && (
                      <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        <div>→ {rec.prompt}</div>
                        {(rec.category !== row?.category || rec.topic !== row?.topic) && (
                          <div className="text-[11px] text-amber-600">
                            {rec.category !== row?.category && `카테고리: ${row?.category} → ${rec.category}`}
                            {rec.category !== row?.category && rec.topic !== row?.topic && " · "}
                            {rec.topic !== row?.topic && `토픽: ${row?.topic} → ${rec.topic}`}
                          </div>
                        )}
                      </div>
                    )}
                    {rec.reason && <p className="text-[11px] text-neutral-500">{rec.reason}</p>}
                  </div>
                </label>
              );
            })}
          </div>

          {applyError && <p className="mt-2 text-xs text-red-600">{applyError}</p>}

          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => setStep("input")} className="text-xs text-neutral-500 underline cursor-pointer">
              이전으로
            </button>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <ShieldCheck size={12} />
                삭제 {deleteCount}건 · 수정 {modifyCount}건 반영
              </span>
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
              <Button variant="primary" disabled={applying || checked.size === 0} onClick={apply}>
                {applying ? "반영하는 중..." : "선택 항목 반영"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
