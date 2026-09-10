"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const STEPS = ["패턴 발굴", "카드 초안", "최종 JSON"] as const;

const VALID_TAGS = new Set(["coverage_gap", "strength"]);

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
    (c.topics as unknown[]).every((t) => typeof t === "string" && t.trim().length > 0)
  );
}

// 브랜드 추가 마법사(AddBrandWizardModal)와 같은 "단계를 넘어가며 빌드업"
// 구조 — 다만 각 단계 입력이 폼이 아니라 "LLM에게 물어보고 답을 붙여넣기"라는
// 점이 다르다. 이전 단계 답변이 다음 단계 프롬프트에 그대로 들어가서, LLM이
// 스스로의 답을 다듬어가며 최종적으로 스키마에 맞는 JSON을 내놓게 유도한다.
// 3단계(최종 JSON)에서만 실제로 스키마 검증 + 저장이 일어난다 — 1·2단계는
// 사람이 대화를 이어가기 위한 중간 산출물일 뿐, DB에 반영되지 않는다.
export function BrainstormWizardModal({
  open,
  onClose,
  digest,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** 실측 토픽별 브랜드 언급 표 — 1단계 프롬프트의 근거 데이터. */
  digest: string;
  onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", ""]);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setStep(0);
    setAnswers(["", "", ""]);
    setError(null);
    onClose();
  }

  function buildPrompt(): string {
    if (step === 0) {
      return `다음은 우리 브랜드의 최근 4주 실측 데이터입니다 — 토픽(프롬프트)별로 각 브랜드가 실제로 언급된 횟수입니다.\n\n${digest}\n\n이 데이터에서 "우리 브랜드가 이미 강하게 자리 잡은 패턴(strength)" 2~3개와 "경쟁사는 언급되는데 우리는 안 잡히는 공백 패턴(coverage_gap)" 2~3개를 찾아 자유 형식으로 간단히 나열해주세요. 아직 정식 포맷은 필요 없습니다 — 어떤 토픽들을 묶어서 어떤 이야기를 할 수 있는지만 알려주세요.`;
    }
    if (step === 1) {
      return `아래는 방금 찾은 강점/공백 패턴입니다:\n\n${answers[0]}\n\n각 패턴을 카드 형태로 다듬어주세요 — 카드마다 (1) 한 줄 제목, (2) 왜 이 패턴이 중요한지 2~3문장 요약, (3) 근거가 되는 한 줄 통계(stat), (4) 이 패턴의 근거가 된 토픽 목록. 아직 JSON일 필요는 없고, 사람이 읽기 좋은 형태로 정리해주세요.`;
    }
    return `아래는 방금 다듬은 카드 초안입니다:\n\n${answers[1]}\n\n이제 이 카드들을 반드시 아래 JSON 배열 형식으로만 답변해주세요. 다른 설명 없이 JSON만 출력하세요:\n\n[{"tag": "strength 또는 coverage_gap", "title": "카드 제목", "summary": "2~3문장 요약", "stat": "근거 통계 한 줄", "topics": ["이 카드의 근거가 된 토픽 문자열 — 반드시 위 실측 데이터 표에 있던 토픽 이름을 정확히 그대로 사용"]}]\n\n주의: topics에는 실측 데이터 표에 있는 토픽 이름만 정확히 그대로 쓰세요. 언급 수 같은 숫자는 절대 만들어내지 마세요 — 어차피 저장할 때 실측 데이터에서 다시 채웁니다.`;
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function updateAnswer(value: string) {
    setAnswers((prev) => prev.map((a, i) => (i === step ? value : a)));
  }

  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(answers[2]);
    } catch {
      setError("JSON으로 해석할 수 없습니다. LLM이 JSON 배열만 답하도록 다시 시도해주세요.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isValidCard)) {
      setError("각 카드는 tag(strength|coverage_gap)/title/summary/stat/topics(문자열 배열)를 모두 가져야 합니다. 형식을 확인해주세요.");
      return;
    }

    // LLM에게 고유 id까지 만들게 하면 중복/누락 위험만 커진다 — 저장 시
    // 여기서 직접 부여한다. 카드 인용 토픽의 groupId로도 쓰이므로 배치
    // 시각+순번으로 매번 고유하게 만든다.
    const batchId = Date.now();
    const withIds = (parsed as { tag: string; title: string; summary: string; stat: string; topics: string[] }[]).map((card, i) => ({
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

  const currentAnswer = answers[step];
  const canProceed = currentAnswer.trim().length > 0;

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">LLM 브레인스토밍 등록</h2>
        <ModalCloseButton onClose={close} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${
                i === step ? "bg-slate-800 text-white" : i < step ? "bg-slate-200 text-slate-600" : "bg-neutral-100 text-neutral-400"
              }`}
            >
              {i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-bold text-neutral-900" : "text-neutral-400"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-neutral-200" />}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-neutral-700">
            {step + 1}. 아래 프롬프트를 복사해 LLM(ChatGPT 등)에 붙여넣으세요
          </span>
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
          value={buildPrompt()}
          rows={6}
          className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600"
        />
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-bold text-neutral-700">{step === 2 ? "최종 JSON 답변을 붙여넣으세요" : "LLM의 답변을 그대로 붙여넣으세요"}</span>
        <textarea
          value={currentAnswer}
          onChange={(e) => updateAnswer(e.target.value)}
          rows={6}
          placeholder="여기에 LLM 답변을 붙여넣으세요"
          className="w-full rounded-md border border-neutral-300 p-3 text-xs text-neutral-800"
        />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex justify-between">
        <Button variant="secondary" onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}>
          {step === 0 ? "취소" : "이전"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
            다음
          </Button>
        ) : (
          <Button variant="primary" disabled={!canProceed || saving} onClick={save}>
            {saving ? "검증 후 저장하는 중..." : "검증 후 저장"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
