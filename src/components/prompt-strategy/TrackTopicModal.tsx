"use client";

import { FormEvent, useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CANONICAL_CATEGORIES } from "@/lib/categories";

const CATEGORY_OPTIONS = CANONICAL_CATEGORIES;

export interface TrackableTopic {
  id: string;
  topic: string;
}

// Matches Figma "Modal / Add Topic to Configuration" (doc §2, reused across
// Visibility Overview/Prompt Research/Market Comparison/Prompt Strategy) —
// Brand(고정: Neodigm)/Category 선택 후 실제로 .tmp/tracked-topics에 저장하고
// (src/lib/backend/trackedTopics.ts) Prompt Library로 이동한다.
export function TrackTopicModal({
  topic,
  onClose,
  onTrack,
}: {
  topic: TrackableTopic | null;
  onClose: () => void;
  onTrack: (topicId: string, category: string) => void;
}) {
  return (
    <Modal open={!!topic} onClose={onClose}>
      {topic && <TrackTopicForm key={topic.id} topic={topic} onClose={onClose} onTrack={onTrack} />}
    </Modal>
  );
}

function TrackTopicForm({
  topic,
  onClose,
  onTrack,
}: {
  topic: TrackableTopic;
  onClose: () => void;
  onTrack: (topicId: string, category: string) => void;
}) {
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onTrack(topic.id, category);
    onClose();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">토픽 추적하기</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        <b>{topic.topic}</b>을(를) 구성에 추가합니다.
      </p>
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
          이 토픽을 프롬프트 라이브러리에 바로 추가하고, 확인할 수 있도록 그 화면으로 이동합니다.
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
