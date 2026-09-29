"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  applyKeywordPlan,
  buildKeywordCleanupPrompt,
  keywordKey,
  KeywordGroupInput,
  KeywordGroupPlan,
  parseKeywordCleanup,
} from "@/lib/searchTrendKeywords";

interface Choice {
  added: Set<string>;
  restored: Set<string>;
}

// 검색어 트렌드 그룹의 검색어를 AI가 정리해 주는 모달. 결과는 폼(검색어 입력칸)에만 반영하고
// 브랜드 관리 DB는 건드리지 않는다 — 검증·적용 규칙은 src/lib/searchTrendKeywords.ts.
export function TrendKeywordCleanupModal({
  open,
  onClose,
  groups,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  groups: KeywordGroupInput[];
  /** 그룹 이름 → 정리된 검색어 목록. */
  onApply: (result: Record<string, string[]>) => void;
}) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [pasted, setPasted] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<KeywordGroupPlan[]>([]);
  const [droppedCount, setDroppedCount] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [copied, setCopied] = useState(false);

  const promptText = buildKeywordCleanupPrompt(groups);

  function close() {
    setStep("input");
    setPasted("");
    setError(null);
    setPlans([]);
    setChoices({});
    setGenerating(false);
    onClose();
  }

  function review(raw: string) {
    const result = parseKeywordCleanup(raw, groups);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPlans(result.plans);
    setDroppedCount(result.droppedCount);
    setChoices(Object.fromEntries(result.plans.map((p) => [p.groupName, { added: new Set(p.added.map(keywordKey)), restored: new Set<string>() }])));
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

  function toggle(groupName: string, field: keyof Choice, key: string) {
    setChoices((prev) => {
      const next = new Set(prev[groupName][field]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [groupName]: { ...prev[groupName], [field]: next } };
    });
  }

  function apply() {
    const result: Record<string, string[]> = {};
    for (const plan of plans) {
      const group = groups.find((g) => g.groupName === plan.groupName);
      if (group) result[plan.groupName] = applyKeywordPlan(group, plan, choices[plan.groupName]);
    }
    onApply(result);
    close();
  }

  const changeCount = plans.reduce((sum, p) => sum + p.added.length + p.removed.length, 0);

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">AI로 검색어 정리</h2>
        </div>
        <ModalCloseButton onClose={close} />
      </div>

      {step === "input" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            그룹마다 제품명·오타·다른 회사 이름·일반 단어처럼 브랜드 검색량을 왜곡하는 검색어를 AI가 골라냅니다. 결과는 확인하고 고른 것만 이 화면의 입력칸에 반영되며, 브랜드 관리 데이터는 바뀌지 않습니다.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-2 text-xs text-slate-700">
              {generating ? (
                <>
                  <Loader2 size={14} className="shrink-0 animate-spin" />
                  <span>AI가 검색어를 검토하는 중입니다… 보통 10~30초 걸립니다. 창을 닫지 마세요.</span>
                </>
              ) : (
                <span>{groups.length}개 그룹의 검색어를 검토합니다.</span>
              )}
            </p>
            <button
              type="button"
              disabled={generating}
              onClick={() => void runAi()}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-3 py-2 text-xs font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-60"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {generating ? "생성하는 중..." : "AI로 자동 생성"}
            </button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-neutral-600">직접 LLM에 물어 붙여넣기</summary>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-700">1. 프롬프트를 복사해 LLM에 붙여넣으세요</span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(promptText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
                >
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <textarea readOnly value={promptText} rows={5} className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600" />
              <span className="text-xs font-bold text-neutral-700">2. 답변을 그대로 붙여넣으세요</span>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder="여기에 LLM 답변을 붙여넣으세요"
                className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
              />
              <div className="flex justify-end">
                <Button variant="secondary" disabled={!pasted.trim()} onClick={() => review(pasted)}>
                  검토하기
                </Button>
              </div>
            </div>
          </details>
        </>
      )}

      {step === "review" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            {plans.length}개 그룹에서 {changeCount}건을 제안했습니다. 빨간 검색어(제거)는 누르면 되돌리고, 초록 검색어(추가)는 누르면 추가하지 않습니다.
            {droppedCount > 0 && ` 형식에 맞지 않거나 다른 그룹과 겹치는 ${droppedCount}건은 자동으로 뺐습니다.`}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {plans.map((plan) => {
              const choice = choices[plan.groupName];
              return (
                <div key={plan.groupName} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
                  <p className="text-sm font-bold text-neutral-900">{plan.groupName}</p>
                  {plan.kept.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.kept.map((k) => (
                        <span key={k} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                  {plan.added.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {plan.added.map((k) => {
                        const on = choice.added.has(keywordKey(k));
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(plan.groupName, "added", keywordKey(k))}
                            className={cn("rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer", on ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-400 line-through")}
                          >
                            + {k}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {plan.removed.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {plan.removed.map((r) => {
                        const restored = choice.restored.has(keywordKey(r.keyword));
                        return (
                          <li key={r.keyword} className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              aria-pressed={restored}
                              onClick={() => toggle(plan.groupName, "restored", keywordKey(r.keyword))}
                              className={cn("shrink-0 rounded-full px-2.5 py-1 font-medium cursor-pointer", restored ? "bg-neutral-100 text-neutral-700" : "bg-red-100 text-red-700 line-through")}
                            >
                              {restored ? "" : "− "}
                              {r.keyword}
                            </button>
                            <span className="text-neutral-500">{restored ? "유지" : (r.reason ?? "AI가 제외")}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        {step === "review" && (
          <Button variant="secondary" onClick={() => setStep("input")}>
            다시 생성
          </Button>
        )}
        <Button variant="secondary" onClick={close}>
          취소
        </Button>
        {step === "review" && <Button onClick={apply}>입력칸에 반영</Button>}
      </div>
    </Modal>
  );
}
