"use client";

import { useState } from "react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SurfacePicker } from "@/components/prompt-library/SurfacePicker";
import type { PromptSurface } from "@/lib/promptSurfaces";

// 고른 프롬프트 여러 개의 플랫폼을 한 번에 같은 값으로 바꾼다 — 개별 편집은 행의 연필 버튼.
export function BulkSurfaceModal({
  open,
  onClose,
  ids,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** 바꿀 추적(라이브러리 행) id */
  ids: string[];
  /** 선택한 프롬프트들의 공통 플랫폼 — 처음 체크 상태 */
  initial: PromptSurface[];
  onSaved: (ids: string[], surfaces: PromptSurface[]) => void;
}) {
  const [surfaces, setSurfaces] = useState<PromptSurface[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tracked-topics/surfaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, surfaces }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "플랫폼을 바꾸지 못했습니다.");
        return;
      }
      onSaved(ids, surfaces);
      onClose();
    } catch {
      setError("플랫폼을 바꾸지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">플랫폼 변경</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        선택한 프롬프트 <b>{ids.length}개</b>를 아래 플랫폼에서 수집하도록 바꿉니다. 체크한 플랫폼만 켜지고, 나머지는 꺼집니다.
      </p>
      <div className="mt-4">
        <SurfacePicker value={surfaces} onChange={setSurfaces} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving || surfaces.length === 0}>
          {saving ? "저장 중..." : "플랫폼 바꾸기"}
        </Button>
      </div>
    </Modal>
  );
}
