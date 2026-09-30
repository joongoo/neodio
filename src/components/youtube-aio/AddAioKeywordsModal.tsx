"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// AIO 추적 프롬프트 추가 — 한 줄에 하나씩 여러 개. 여기서 추가한 프롬프트는 프롬프트 라이브러리에도 등록되고
// Google AI Overview 표면으로 수집된다(docs/prompt-surfaces-plan.md). 그룹은 더 이상 고르지 않는다.
export function AddAioKeywordsModal({ open, onClose, brandId }: { open: boolean; onClose: () => void; brandId: string }) {
  const router = useRouter();
  const [keywords, setKeywords] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = keywords.split(/\r?\n/).filter((k) => k.trim()).length;

  function close() {
    setKeywords("");
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/youtube-aio/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, keywords }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setError(data?.error ?? "프롬프트를 추가하지 못했습니다.");
      return;
    }
    close();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">프롬프트 추가</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">프롬프트 * (한 줄에 하나)</span>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={6}
            autoFocus
            placeholder={"Slack 세일즈포스 연동\n영업 파이프라인 관리 방법"}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-xs text-neutral-500">추가한 프롬프트는 프롬프트 라이브러리에도 등록되고 다음 수집부터 반영됩니다. 이미 있는 프롬프트는 다시 켜지기만 합니다.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={pending || count === 0}>
            {pending ? "추가 중…" : `${count > 0 ? `${count}개 ` : ""}추가`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
