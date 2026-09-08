"use client";

import { FormEvent, useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CANONICAL_CATEGORIES } from "@/lib/categories";

const CATEGORY_OPTIONS = CANONICAL_CATEGORIES;

// Two distinct entry points into the same "add to prompt configuration" flow
// (Figma "Add topic to configuration" / "Add prompt to configuration"):
// tracking a topic row adds every prompt under that topic; tracking a single
// prompt inside the expanded accordion adds just that one, tagged with which
// topic it came from. They used to share one generic modal with topic-only
// copy — this restores the two distinct headings/descriptions.
// `market`/`prompts` are optional because not every caller has them: Prompt
// Research/Prompt Strategy track a bare topic row with no market or
// prompt-list context, while Visibility Overview's topic rows have both.
export type TrackTarget =
  | { kind: "topic"; id: string; topic: string; market?: string; prompts?: { id: string; prompt: string }[] }
  | { kind: "prompt"; id: string; prompt: string; topic: string; market?: string };

export function TrackTopicModal({
  target,
  onClose,
  onTrack,
}: {
  target: TrackTarget | null;
  onClose: () => void;
  onTrack: (target: TrackTarget, category: string) => void;
}) {
  return (
    <Modal open={!!target} onClose={onClose}>
      {target && <TrackForm key={target.id} target={target} onClose={onClose} onTrack={onTrack} />}
    </Modal>
  );
}

function TrackForm({
  target,
  onClose,
  onTrack,
}: {
  target: TrackTarget;
  onClose: () => void;
  onTrack: (target: TrackTarget, category: string) => void;
}) {
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const isTopic = target.kind === "topic";

  function submit(e: FormEvent) {
    e.preventDefault();
    onTrack(target, category);
    onClose();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{isTopic ? "토픽 추적하기" : "프롬프트 추적하기"}</h2>
        <ModalCloseButton onClose={onClose} />
      </div>

      {isTopic ? (
        <>
          <p className="mt-2 text-sm text-neutral-600">
            {target.prompts && target.prompts.length > 0 ? (
              <>
                <b>{target.prompts.length}개 프롬프트</b>가 <b>{target.topic}</b>
                {target.market && (
                  <>
                    (마켓: <b>{target.market}</b>)
                  </>
                )}{" "}
                구성에 추가됩니다.
              </>
            ) : (
              <>
                <b>{target.topic}</b>
                {target.market && (
                  <>
                    (마켓: <b>{target.market}</b>)
                  </>
                )}
                을(를) 구성에 추가합니다.
              </>
            )}
          </p>
          {target.prompts && target.prompts.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 rounded-md border border-neutral-200 p-3">
              {target.prompts.map((p) => (
                <li key={p.id} className="flex items-start gap-1.5 text-xs text-neutral-700">
                  <span className="mt-0.5 text-neutral-400">•</span>
                  {p.prompt}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          프롬프트 <b>{target.prompt}</b>
          {target.market && (
            <>
              (마켓: <b>{target.market}</b>)
            </>
          )}
          가 토픽 <b>{target.topic}</b>과 함께 프롬프트 관리에 추가됩니다.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">브랜드</span>
          <input disabled value="Neodigm" className="h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">카테고리 *</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
          {isTopic ? "이 토픽의 프롬프트를" : "이 프롬프트를"} 프롬프트 라이브러리에 바로 추가하고, 확인할 수 있도록 그
          화면으로 이동합니다.
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary">
            추가 후 구성 보기
          </Button>
        </div>
      </form>
    </>
  );
}
