"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  BRAND_KINDS,
  BRAND_KIND_LABEL,
  COMPETITOR_TIERS,
  TIER_LABEL,
  buildBrandOptimizationPrompt,
  nameKey,
  parseBrandOptimization,
  type BrandKind,
  type CompetitorTier,
  type BrandOptimizationInput,
  type BrandOptimizationPlan,
} from "@/lib/brandOptimization";

// 브랜드 이름 정리(브랜드 최적화)의 공용 모달 — 가시성 개요의 "브랜드 최적화"와 브랜드 설정의
// "AI로 브랜드 정리"가 같이 쓴다. "AI로 자동 생성" 버튼을 누르면 AI가 정리안을 만들고(수동 붙여넣기도 가능),
// 항목별로 확인·체크한 것만 onApply로 넘겨 반영한다. 규칙(검증·적용)은 src/lib/brandOptimization.ts.
export function BrandOptimizationModal({
  open,
  onClose,
  input,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  input: BrandOptimizationInput;
  /** 체크한 항목만 담은 계획. 실패 메시지를 돌려주면 모달에 보여 준다. */
  onApply: (plan: BrandOptimizationPlan) => Promise<string | null> | string | null | void;
}) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BrandOptimizationPlan | null>(null);
  const [droppedCount, setDroppedCount] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** 검토 중 사람이 바꾼 역할 — 없으면 AI 판정 그대로 */
  const [roleKinds, setRoleKinds] = useState<Record<string, BrandKind>>({});
  const [roleTiers, setRoleTiers] = useState<Record<string, CompetitorTier | "">>({});
  const [applying, setApplying] = useState(false);

  const promptText = buildBrandOptimizationPrompt(input);
  const registeredKeys = new Set(input.registered.map((r) => nameKey(r.name)));
  const nothingToDo = input.registered.length === 0 && input.candidates.length === 0 && !input.evidence;

  function close() {
    setStep("input");
    setPasted("");
    setError(null);
    setPlan(null);
    setChecked(new Set());
    setRoleKinds({});
    setRoleTiers({});
    setGenerating(false);
    setApplying(false);
    onClose();
  }

  function review(raw: string) {
    const result = parseBrandOptimization(raw, input);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPlan(result.plan);
    setDroppedCount(result.droppedCount);
    setChecked(
      new Set([
        ...result.plan.ownAliases.map((n) => `own:${nameKey(n)}`),
        ...result.plan.competitors.map((c) => `comp:${nameKey(c.name)}`),
        ...result.plan.exclude.map((n) => `ex:${nameKey(n)}`),
        ...(result.plan.roles ?? []).map((r) => `role:${nameKey(r.name)}`),
      ])
    );
    setRoleKinds({});
    setRoleTiers({});
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

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function apply() {
    if (!plan) return;
    const accepted: BrandOptimizationPlan = {
      ownAliases: plan.ownAliases.filter((n) => checked.has(`own:${nameKey(n)}`)),
      competitors: plan.competitors.filter((c) => checked.has(`comp:${nameKey(c.name)}`)),
      exclude: plan.exclude.filter((n) => checked.has(`ex:${nameKey(n)}`)),
      suggestions: (plan.suggestions ?? [])
        .filter((item) => checked.has(`sug:${nameKey(item.name)}`))
        .map((item) => {
          const picked = roleTiers[nameKey(item.name)];
          return { ...item, tier: picked === undefined ? item.tier : picked || undefined };
        }),
      roles: (plan.roles ?? []).filter((r) => checked.has(`role:${nameKey(r.name)}`)).map((r) => {
        const kind = roleKinds[nameKey(r.name)] ?? r.kind;
        const picked = roleTiers[nameKey(r.name)];
        const tier = kind === "competitor" ? (picked === undefined ? r.tier : picked || undefined) : undefined;
        return { ...r, kind, tier };
      }),
    };
    setApplying(true);
    setError(null);
    try {
      const failure = await onApply(accepted);
      if (failure) {
        setError(failure);
        return;
      }
      close();
    } finally {
      setApplying(false);
    }
  }

  const total = checked.size;

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">AI로 브랜드 정리</h2>
        </div>
        <ModalCloseButton onClose={close} />
      </div>

      {step === "input" && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            브랜드 이름들을 AI가 검토해 먼저 업종과 무관하거나 경쟁사로 추적할 가치가 없는 브랜드를 삭제 대상으로 고르고, 남은 브랜드의 역할(경쟁사·솔루션·채널)·등급·설명·별칭을 정리합니다. 결과는 확인하고 고른 것만 반영됩니다.
          </p>
          {nothingToDo ? (
            <p className="mt-4 rounded-md bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500">정리할 경쟁 브랜드나 후보가 아직 없습니다.</p>
          ) : (
            <>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-2 text-xs text-slate-700">
                  {generating ? (
                    <>
                      <Loader2 size={14} className="shrink-0 animate-spin" />
                      <span>AI가 브랜드 이름을 검토하는 중입니다… 보통 10~30초 걸립니다. 창을 닫지 마세요.</span>
                    </>
                  ) : (
                    <span>아직 실행 전입니다. 버튼을 누르면 AI가 목록을 검토해 정리안을 만듭니다.</span>
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
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-700">직접 하려면: 아래 프롬프트를 복사해 LLM(ChatGPT 등)에 붙여넣으세요</span>
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
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <span className="text-xs font-bold text-neutral-700">LLM의 JSON 답변을 붙여넣으세요</span>
                <textarea
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value);
                    setError(null);
                  }}
                  rows={5}
                  placeholder="여기에 LLM 답변을 붙여넣으세요"
                  className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
                />
              </div>
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              취소
            </Button>
            {!nothingToDo && (
              <>
                <Button variant="primary" disabled={!pasted.trim() || generating} onClick={() => review(pasted)}>
                  정리안 검토하기
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {step === "review" && plan && (
        <>
          <p className="mt-2 text-xs text-neutral-500">
            반영할 항목만 선택하세요 — 체크 해제한 항목은 그대로 유지됩니다.
            {droppedCount > 0 && <span className="ml-1 text-amber-700">(목록에 없는 이름 {droppedCount}개는 무시했습니다)</span>}
          </p>
          <div className="mt-3 flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
            {plan.exclude.length > 0 && (
              <ReviewGroup title="삭제 — 업종과 무관하거나 경쟁사로 추적할 가치가 없는 브랜드">
                {plan.exclude.map((name) => {
                  const reason = plan.excludeReasons?.[nameKey(name)];
                  return (
                    <ReviewItem key={name} checked={checked.has(`ex:${nameKey(name)}`)} onToggle={() => toggle(`ex:${nameKey(name)}`)}>
                      <b>{name}</b>
                      <Note>{registeredKeys.has(nameKey(name)) ? "기타 브랜드에서 삭제" : "후보에서 숨김"}</Note>
                      {reason && <span className="basis-full text-[11px] text-neutral-500">{reason}</span>}
                    </ReviewItem>
                  );
                })}
              </ReviewGroup>
            )}
            {plan.ownAliases.length > 0 && (
              <ReviewGroup title="우리 브랜드의 다른 표기로 이동">
                {plan.ownAliases.map((name) => (
                  <ReviewItem key={name} checked={checked.has(`own:${nameKey(name)}`)} onToggle={() => toggle(`own:${nameKey(name)}`)}>
                    <b>{name}</b> → {input.own.name} 별칭
                    {registeredKeys.has(nameKey(name)) && <Note>경쟁사 목록에서 제거</Note>}
                  </ReviewItem>
                ))}
              </ReviewGroup>
            )}
            {plan.competitors.filter((c) => c.aliases.length > 0).length > 0 && (
              <ReviewGroup title="같은 경쟁사로 병합">
                {plan.competitors
                  .filter((c) => c.aliases.length > 0)
                  .map((c) => (
                    <ReviewItem key={c.name} checked={checked.has(`comp:${nameKey(c.name)}`)} onToggle={() => toggle(`comp:${nameKey(c.name)}`)}>
                      <b>{c.name}</b> ← {c.aliases.join(", ")}
                    </ReviewItem>
                  ))}
              </ReviewGroup>
            )}
            {(plan.roles ?? []).length > 0 && (
              <ReviewGroup title="역할 분류 (경쟁사·솔루션·채널)">
                {[...(plan.roles ?? [])]
                  .sort((a, b) => BRAND_KINDS.indexOf(roleKinds[nameKey(a.name)] ?? a.kind) - BRAND_KINDS.indexOf(roleKinds[nameKey(b.name)] ?? b.kind))
                  .map((r) => {
                    const key = nameKey(r.name);
                    const kind = roleKinds[key] ?? r.kind;
                    return (
                      <ReviewItem key={r.name} checked={checked.has(`role:${key}`)} onToggle={() => toggle(`role:${key}`)}>
                        <b>{r.name}</b>
                        <select
                          aria-label={`${r.name} 역할`}
                          value={kind}
                          onChange={(e) => setRoleKinds((prev) => ({ ...prev, [key]: e.target.value as BrandKind }))}
                          className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px]"
                        >
                          {BRAND_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {BRAND_KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                        {kind === "competitor" && (
                          <select
                            aria-label={`${r.name} 경쟁사 등급`}
                            value={roleTiers[key] === undefined ? (r.tier ?? "") : roleTiers[key]}
                            onChange={(e) => setRoleTiers((prev) => ({ ...prev, [key]: e.target.value as CompetitorTier | "" }))}
                            className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px]"
                          >
                            <option value="">등급 미정</option>
                            {COMPETITOR_TIERS.map((t) => (
                              <option key={t} value={t}>
                                {TIER_LABEL[t]}
                              </option>
                            ))}
                          </select>
                        )}
                        {!registeredKeys.has(key) && kind === "competitor" && <Note>경쟁사로 새로 등록</Note>}
                        {!registeredKeys.has(key) && kind !== "competitor" && <Note>미등록 후보 — 경쟁사가 아니면 반영 안 됨</Note>}
                        {r.description && <span className="basis-full text-neutral-600">{r.description}</span>}
                        {r.reason && <span className="basis-full text-[11px] text-neutral-400">{r.reason}</span>}
                      </ReviewItem>
                    );
                  })}
              </ReviewGroup>
            )}
            {(plan.suggestions ?? []).length > 0 && (
              <ReviewGroup title="AI가 추가로 제안한 경쟁사 (미검증 · 기본은 선택 안 됨)">
                {(plan.suggestions ?? []).map((item) => {
                  const key = nameKey(item.name);
                  return (
                    <ReviewItem key={item.name} checked={checked.has(`sug:${key}`)} onToggle={() => toggle(`sug:${key}`)}>
                      <b>{item.name}</b>
                      <select
                        aria-label={`${item.name} 경쟁사 등급`}
                        value={roleTiers[key] === undefined ? (item.tier ?? "") : roleTiers[key]}
                        onChange={(e) => setRoleTiers((prev) => ({ ...prev, [key]: e.target.value as CompetitorTier | "" }))}
                        className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px]"
                      >
                        <option value="">등급 미정</option>
                        {COMPETITOR_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                      <Note>미검증 — 실존·규모를 확인하세요</Note>
                      {item.description && <span className="basis-full text-neutral-600">{item.description}</span>}
                      {item.reason && <span className="basis-full text-[11px] text-neutral-400">{item.reason}</span>}
                    </ReviewItem>
                  );
                })}
              </ReviewGroup>
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" onClick={() => setStep("input")}>
              이전으로
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">{total}개 항목 반영</span>
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
              <Button variant="primary" disabled={total === 0 || applying} onClick={apply}>
                {applying ? "반영하는 중..." : "선택 항목 반영"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function ReviewGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-neutral-700">{title}</h3>
      <ul className="mt-1.5 flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function ReviewItem({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 text-xs text-neutral-800 hover:bg-neutral-50">
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-0.5" />
        <span className="flex flex-wrap items-center gap-x-2">{children}</span>
      </label>
    </li>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{children}</span>;
}
