"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

// 붙여넣기 방식 모달들의 "AI로 자동 생성" — 모달이 만든 프롬프트를 서버(/api/llm-generate)가
// LLM API에 물어 답변 원문을 돌려주고, 모달은 그것을 붙여넣기 칸에 채운다. 저장·반영은
// 항상 기존 검증(parse)과 사람의 확인을 거친 뒤에 일어난다(이 컴포넌트는 저장하지 않는다).
export function AiGenerateButton({
  promptText,
  sourceUrl,
  onGenerated,
  onError,
  className = "",
}: {
  promptText: string;
  /** 있으면 서버가 이 페이지(등록된 브랜드 도메인만)의 본문을 가져와 근거로 붙인다. */
  sourceUrl?: string;
  onGenerated: (text: string) => void;
  onError: (message: string) => void;
  className?: string;
}) {
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/llm-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText, sourceUrl }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        onError(body?.error ?? "자동 생성하지 못했습니다.");
        return;
      }
      onGenerated(body.text);
    } catch {
      onError("자동 생성하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={generate}
      disabled={generating}
      className={`flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-60 ${className}`}
    >
      {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
      {generating ? "생성하는 중..." : "AI로 자동 생성"}
    </button>
  );
}
