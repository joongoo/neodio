"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// "선택 수집"의 Gemini 단계 — 수집기 없이 서버가 Gemini API로 프롬프트를 한 건씩 물어 결과를 저장한다.
type Item = { keyword: string; state: "wait" | "run" | "ok" | "fail"; citations?: number; error?: string };

export function GeminiCollectModal({ keywords, onClose, onDone }: { keywords: string[]; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<Item[]>(() => keywords.map((keyword) => ({ keyword, state: "wait" })));
  const [finished, setFinished] = useState(false);
  const cancelRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const patch = (index: number, next: Partial<Item>) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...next } : it)));
    (async () => {
      for (let i = 0; i < keywords.length; i++) {
        if (cancelRef.current) return;
        patch(i, { state: "run" });
        try {
          const res = await fetch("/api/gemini-collect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: keywords[i] }),
          });
          const data = (await res.json().catch(() => ({}))) as { citations?: number; error?: string };
          if (!res.ok) patch(i, { state: "fail", error: data.error ?? `오류 ${res.status}` });
          else patch(i, { state: "ok", citations: data.citations ?? 0 });
          if (res.status === 503) break;
        } catch {
          patch(i, { state: "fail", error: "네트워크 오류" });
        }
      }
      if (!cancelRef.current) {
        setFinished(true);
        onDone();
      }
    })();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const okCount = items.filter((it) => it.state === "ok").length;
  const failCount = items.filter((it) => it.state === "fail").length;

  return (
    <Modal open onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">Gemini 수집</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-2 text-sm text-neutral-600">
        Gemini API로 {keywords.length}개 프롬프트를 차례로 물어 답변과 출처를 저장합니다. 이 PC의 수집기는 필요 없습니다.
      </p>
      <ul className="mt-4 flex max-h-72 flex-col gap-1 overflow-y-auto">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm">
            {it.state === "run" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-neutral-500" />
            ) : it.state === "ok" ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : it.state === "fail" ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            ) : (
              <span className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-neutral-800">{it.keyword}</span>
              {it.state === "ok" && <span className="text-xs text-neutral-500">{it.citations ? `출처 ${it.citations}개` : "출처 없음"}</span>}
              {it.state === "fail" && <span className="text-xs text-amber-700">{it.error}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-neutral-500">{finished ? `완료 — 성공 ${okCount}개, 실패 ${failCount}개` : `${okCount + failCount}/${items.length}`}</span>
        <Button variant="primary" onClick={onClose}>
          {finished ? "확인" : "중단"}
        </Button>
      </div>
    </Modal>
  );
}
