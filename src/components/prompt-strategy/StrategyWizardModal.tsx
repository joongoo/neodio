"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { AiGenerateButton } from "@/components/ui/AiGenerateButton";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatExistingTopicsBlock } from "@/components/prompt-strategy/PromptStrategyClient";
import { buildStrategyPrompt, parseStrategyCards, STRATEGY_KINDS, type StrategyKind } from "@/lib/strategyCards";

// "검색어 트렌드 분석"·"사이트맵 크롤 분석" — 근거 표를 서버에서 만들어(열 때 한 번) 프롬프트에 붙이고, 복사하거나
// "AI로 자동 생성"으로 답을 받아 검증 후 저장한다. 흐름은 가상 사용자 질문 마법사와 같다.
export function StrategyWizardModal({
  open,
  kind,
  onClose,
  topicOptionsByCategory,
  uncategorizedTopicOptions,
  onSaved,
}: {
  open: boolean;
  kind: StrategyKind;
  onClose: () => void;
  topicOptionsByCategory: Record<string, string[]>;
  uncategorizedTopicOptions: string[];
  onSaved: () => void;
}) {
  const config = STRATEGY_KINDS[kind];
  const [digest, setDigest] = useState<string | null>(null);
  const [digestError, setDigestError] = useState<string | null>(null);
  // 검색어 트렌드 전용 — 조회에 쓴 주제어(쉼표로 구분). 고쳐서 다시 불러올 수 있다.
  const [keywordText, setKeywordText] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const query = kind === "trend" && reloadKey > 0 && keywordText.trim() ? `&keywords=${encodeURIComponent(keywordText)}` : "";
    fetch(`/api/strategy-digest?kind=${kind}${query}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && typeof body?.digest === "string") {
          setDigest(body.digest);
          if (Array.isArray(body.keywords) && reloadKey === 0) setKeywordText(body.keywords.join(", "));
        } else setDigestError(body?.error ?? "근거 데이터를 불러오지 못했습니다.");
      })
      .catch(() => !cancelled && setDigestError("근거 데이터를 불러오지 못했습니다."));
    return () => {
      cancelled = true;
    };
    // keywordText는 "다시 불러오기"를 눌렀을 때만 읽는다(reloadKey로 트리거) — 입력 중 매번 조회하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, reloadKey]);

  function close() {
    // 다음에 열 때 이전 근거가 잠깐 보이지 않게 비운다(열릴 때 다시 불러온다).
    setDigest(null);
    setDigestError(null);
    setKeywordText("");
    setReloadKey(0);
    setAnswer("");
    setError(null);
    onClose();
  }

  const promptText = digest ? buildStrategyPrompt(kind, digest, formatExistingTopicsBlock(topicOptionsByCategory, uncategorizedTopicOptions)) : "";

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    const parsed = parseStrategyCards(answer, kind);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/llm-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: config.scope, key: "current", data: parsed.cards }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "저장하지 못했습니다.");
        return;
      }
      onSaved();
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{config.title}</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">{config.description}</p>

      {digest === null && !digestError && (
        <p className="mt-4 flex items-center gap-2 text-xs text-slate-600">
          <Loader2 size={14} className="animate-spin" />
          {config.digestLabel}를 불러오는 중…
        </p>
      )}
      {digestError && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{digestError}</p>}

      {kind === "trend" && (digest !== null || keywordText) && (
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-bold text-neutral-700">조회할 주제어 (쉼표로 구분, 최대 8개)</span>
          <div className="flex gap-2">
            <input
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-xs text-neutral-800"
              placeholder="예: 마케팅 자동화, 마케토 구축"
            />
            <Button
              variant="secondary"
              disabled={!keywordText.trim() || digest === null}
              onClick={() => {
                setDigest(null);
                setReloadKey((k) => k + 1);
              }}
            >
              다시 불러오기
            </Button>
          </div>
          <span className="text-[11px] text-neutral-400">프롬프트 라이브러리 토픽에서 뽑은 주제어입니다. 사람들이 검색창에 실제로 칠 만한 짧은 말로 고치면 더 잘 집계됩니다.</span>
        </div>
      )}

      {digest !== null && (
        <>
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
            <textarea readOnly value={promptText} rows={6} className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600" />
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-700">2. LLM의 JSON 답변을 붙여넣으세요</span>
              <AiGenerateButton promptText={promptText} onGenerated={setAnswer} onError={setError} />
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
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
        <Button variant="primary" disabled={!answer.trim() || saving || digest === null} onClick={save}>
          {saving ? "검증 후 저장하는 중..." : "검증 후 저장"}
        </Button>
      </div>
    </Modal>
  );
}
