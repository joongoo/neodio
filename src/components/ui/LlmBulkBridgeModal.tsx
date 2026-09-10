"use client";

import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// LlmBridgeModal의 "여러 key를 한 번에" 버전 — 실측 그룹(검색어/URL 등)
// 목록을 프롬프트에 전부 넣고, LLM이 그룹마다 프롬프트 배열을 가진 하나의
// JSON 객체로 한 번에 답하게 한 뒤 모든 key를 한 번에 저장한다. 그룹별로
// 따로따로 등록 버튼을 누르지 않아도 되게 하기 위한 상단 마법사용 컴포넌트.
export function LlmBulkBridgeModal({
  open,
  onClose,
  title,
  instructions,
  scope,
  promptText,
  parse,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  instructions?: string;
  scope: string;
  promptText: string;
  /** 붙여넣은 텍스트를 { key: 프롬프트 배열 } 형태로 바꾼다. */
  parse: (raw: string) => { entries: Record<string, unknown> } | { error: string };
  onSaved?: () => void;
}) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setPasted("");
    setError(null);
    setSaving(false);
    onClose();
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    const result = parse(pasted);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/llm-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, bulk: true, entries: result.entries }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "저장하지 못했습니다.");
        return;
      }
      onSaved?.();
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-slate-500" />
          <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        </div>
        <ModalCloseButton onClose={close} />
      </div>
      {instructions && <p className="mt-2 text-xs text-neutral-500">{instructions}</p>}

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
        <span className="text-xs font-bold text-neutral-700">2. LLM의 답변을 그대로 붙여넣으세요</span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={7}
          placeholder="여기에 LLM 답변을 붙여넣으세요"
          className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          취소
        </Button>
        <Button variant="primary" disabled={saving || !pasted.trim()} onClick={save}>
          {saving ? "검증 후 저장하는 중..." : "검증 후 저장"}
        </Button>
      </div>
    </Modal>
  );
}
