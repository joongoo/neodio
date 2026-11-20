"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function GeminiCollectModal({ keywords, onClose, onDone }: { keywords: string[]; onClose: () => void; onDone: () => void }) {
  const started = useRef(false);
  const [result, setResult] = useState<{ href?: string; error?: string } | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const requestId = crypto.randomUUID();
        const registered = await fetch("/api/collection-requests/legacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, items: keywords.map(query => ({ query, surface: "gemini" })) }) });
        if (!registered.ok) throw new Error((await registered.json()).error ?? "요청 등록에 실패했습니다.");
        const response = await fetch("/api/gemini-collect/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId, keywords }) });
        const data = await response.json() as { error?: string; href?: string };
        if (!response.ok) { setResult({ ...data, error: data.error ?? "작업 등록에 실패했습니다." }); return; }
        setResult(data);
        onDone();
      } catch (error) { setResult({ error: error instanceof Error ? error.message : "작업 등록에 실패했습니다." }); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per collection
  }, []);
  return <Modal open onClose={onClose}>
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Gemini 수집</h2><ModalCloseButton onClose={onClose} /></div>
    <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border p-4 text-sm">
      {!result ? <Loader2 size={18} className="animate-spin" /> : result.error ? <TriangleAlert size={18} /> : <CircleCheck size={18} />}
      <div><p>{!result ? "Gemini 수집 작업을 등록하고 있습니다." : result.error ?? "Gemini 수집 작업이 등록되었습니다."}</p>
        {result?.href && <><p className="mt-1 text-xs text-neutral-500">최대 3건씩 동시에 처리합니다. 이 창을 닫아도 수집은 계속되며, 진행 상황과 결과는 요청 로그에서 확인할 수 있습니다.</p><a href={result.href} className="mt-2 inline-block font-semibold underline">수집 요청 상세 보기</a></>}
      </div>
    </div>
    <div className="mt-4 flex justify-end"><Button onClick={onClose}>{result ? "확인" : "닫기"}</Button></div>
  </Modal>;
}
