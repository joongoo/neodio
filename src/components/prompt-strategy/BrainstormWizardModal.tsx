"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { AiGenerateButton } from "@/components/ui/AiGenerateButton";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatExistingTopicsBlock } from "@/components/prompt-strategy/PromptStrategyClient";

const VALID_TAGS = new Set(["coverage_gap", "strength"]);

function isValidTopicItem(item: unknown): boolean {
  const t = item as Record<string, unknown>;
  return (
    typeof t?.prompt === "string" &&
    (t.prompt as string).trim().length > 0 &&
    typeof t?.category === "string" &&
    (t.category as string).trim().length > 0 &&
    typeof t?.topic === "string" &&
    (t.topic as string).trim().length > 0
  );
}

function isValidCard(item: unknown): boolean {
  const c = item as Record<string, unknown>;
  return (
    typeof c?.tag === "string" &&
    VALID_TAGS.has(c.tag as string) &&
    typeof c?.title === "string" &&
    (c.title as string).trim().length > 0 &&
    typeof c?.summary === "string" &&
    (c.summary as string).trim().length > 0 &&
    typeof c?.stat === "string" &&
    Array.isArray(c?.topics) &&
    (c.topics as unknown[]).length > 0 &&
    (c.topics as unknown[]).every(isValidTopicItem)
  );
}

// 실측 데이터(digest)에서 강점/공백 패턴을 찾아 카드로 만드는 "LLM 브레인스토밍" — 예전엔
// 패턴 발굴 → 카드 초안 → 최종 JSON의 3단계 대화였지만, 한 번의 프롬프트로 최종 JSON까지
// 요청하는 1단계로 합쳤다. 프롬프트를 복사해 외부 LLM에 붙여넣거나 "AI로 자동 생성"으로
// 서버가 대신 물어 답변을 채운 뒤, "검증 후 저장"에서 스키마 검증과 저장이 일어난다.
export function BrainstormWizardModal({
  open,
  onClose,
  digest,
  topicOptionsByCategory,
  uncategorizedTopicOptions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** 실측 토픽별 브랜드 언급 표 — 프롬프트의 근거 데이터. */
  digest: string;
  /** 프롬프트에 보여줄 기존 카테고리별 토픽 목록. */
  topicOptionsByCategory: Record<string, string[]>;
  uncategorizedTopicOptions: string[];
  onSaved: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setAnswer("");
    setError(null);
    onClose();
  }

  const promptText = `다음은 우리 브랜드의 최근 4주 실측 데이터입니다 — 토픽(프롬프트)별로 각 브랜드가 실제로 언급된 횟수입니다.\n\n${digest}\n\n이 데이터에서 "우리 브랜드가 이미 강하게 자리 잡은 패턴(strength)" 2~3개와 "경쟁사는 언급되는데 우리는 안 잡히는 공백 패턴(coverage_gap)" 2~3개를 찾아, 각각을 카드로 만들어주세요. 카드마다 (1) 한 줄 제목, (2) 왜 이 패턴이 중요한지 2~3문장 요약, (3) 근거가 되는 한 줄 통계(stat), (4) 이 패턴의 근거가 된 토픽 목록이 필요합니다.\n\n${formatExistingTopicsBlock(topicOptionsByCategory, uncategorizedTopicOptions)}\n\n반드시 아래 JSON 배열 형식으로만 답변해주세요. 다른 설명 없이 JSON만 출력하세요:\n\n[{"tag": "strength 또는 coverage_gap", "title": "카드 제목", "summary": "2~3문장 요약", "stat": "근거 통계 한 줄", "topics": [{"prompt": "이 카드의 근거가 된 토픽 문자열 — 반드시 위 실측 데이터 표에 있던 토픽 이름을 정확히 그대로 사용", "category": "카테고리", "topic": "토픽"}]}]\n\n주의: topics[].prompt에는 실측 데이터 표에 있는 토픽 이름만 정확히 그대로 쓰세요. 언급 수 같은 숫자는 절대 만들어내지 마세요 — 어차피 저장할 때 실측 데이터에서 다시 채웁니다.`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    // 코드 블록(```json)이나 설명이 섞여 와도 첫 '['부터 마지막 ']'까지를 다시 시도한다.
    let parsed: unknown;
    const start = answer.indexOf("[");
    const end = answer.lastIndexOf("]");
    try {
      parsed = JSON.parse(answer);
    } catch {
      try {
        if (start === -1 || end <= start) throw new Error("no array");
        parsed = JSON.parse(answer.slice(start, end + 1));
      } catch {
        setError("JSON으로 해석할 수 없습니다. LLM이 JSON 배열만 답하도록 다시 시도해주세요.");
        return;
      }
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isValidCard)) {
      setError("각 카드는 tag(strength|coverage_gap)/title/summary/stat/topics(문자열 배열)를 모두 가져야 합니다. 형식을 확인해주세요.");
      return;
    }

    // LLM에게 고유 id까지 만들게 하면 중복/누락 위험만 커진다 — 저장 시
    // 여기서 직접 부여한다. 카드 인용 토픽의 groupId로도 쓰이므로 배치
    // 시각+순번으로 매번 고유하게 만든다.
    const batchId = Date.now();
    const withIds = (
      parsed as {
        tag: string;
        title: string;
        summary: string;
        stat: string;
        topics: { prompt: string; category: string; topic: string }[];
      }[]
    ).map((card, i) => ({
      id: `brainstorm-${batchId}-${i}`,
      ...card,
    }));

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/llm-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "llm-brainstorm", key: "current", data: withIds }),
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
        <h2 className="text-lg font-bold text-neutral-900">LLM 브레인스토밍 등록</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <p className="mt-2 text-xs text-neutral-500">실측 데이터에서 강점·공백 패턴을 찾아 추천 카드를 만듭니다. 결과는 검증을 통과해야 저장됩니다.</p>

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
          rows={6}
          className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600"
        />
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

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          취소
        </Button>
        <Button variant="primary" disabled={!answer.trim() || saving} onClick={save}>
          {saving ? "검증 후 저장하는 중..." : "검증 후 저장"}
        </Button>
      </div>
    </Modal>
  );
}
