"use client";

import { useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface ColumnOption {
  key: string;
  label: string;
}

function sameSet(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((k) => b.has(k));
}

// Matches Figma "Modal - Configure columns" (node 837:10983) — a generic
// checkbox list of optional columns a table can hide/show. The table's
// primary column (e.g. "토픽", "프롬프트") and its action column are never
// passed in here; only the columns worth toggling are.
export function ConfigureColumnsModal({
  open,
  onClose,
  columns,
  visible,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  columns: ColumnOption[];
  visible: Set<string>;
  onApply: (visible: Set<string>) => void;
}) {
  // Seeded from `visible` and kept in sync with it on every close path
  // (cancel/apply/backdrop/Escape all funnel through `cancel` or `apply`
  // below), so there's no stale-draft case that needs a useEffect resync.
  const [draft, setDraft] = useState(visible);

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function cancel() {
    setDraft(visible);
    onClose();
  }

  function apply() {
    onApply(draft);
    onClose();
  }

  return (
    <Modal open={open} onClose={cancel}>
      <div className="relative">
        <h2 className="text-2xl font-bold text-neutral-900">컬럼 설정</h2>
        <div className="absolute right-0 top-0">
          <ModalCloseButton onClose={cancel} />
        </div>
      </div>
      <p className="mt-5 text-sm font-bold text-neutral-900">테이블에 표시할 열을 선택하세요.</p>
      <div className="mt-3 flex flex-col gap-3">
        {columns.map((col) => (
          <label key={col.key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.has(col.key)}
              onChange={() => toggle(col.key)}
              className="size-4 cursor-pointer accent-slate-800"
            />
            <span className="text-[13px] text-neutral-700">{col.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-6 flex gap-2.5">
        <Button variant="secondary" onClick={cancel}>
          취소
        </Button>
        <Button variant="primary" onClick={apply} disabled={sameSet(draft, visible)}>
          적용
        </Button>
      </div>
    </Modal>
  );
}
