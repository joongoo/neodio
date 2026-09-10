"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { GscUrlIndexStatus } from "@/lib/db";

// URL Inspection API로 확인한 구글 실제 인덱싱 상태 — 우리 자체 크롤 가시성
// 점수와 별개의 신호라서 별도 컬럼/배지로 보여준다. 클릭하면 그 자리에서
// 다시 확인(API 재호출)한다. (docs/gsc-additional-signals.md §3-①)
export function GoogleIndexBadge({ url, status }: { url: string; status?: GscUrlIndexStatus }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/gsc-url-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "확인하지 못했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-neutral-500">
        <Loader2 size={12} className="animate-spin" /> 확인 중...
      </span>
    );
  }

  if (!status) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          check();
        }}
        title={error ?? undefined}
        className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-500 cursor-pointer hover:bg-neutral-200"
      >
        <HelpCircle size={12} />
        {error ? "다시 시도" : "인덱싱 확인"}
      </button>
    );
  }

  const isIndexed = status.coverageState.toLowerCase().includes("submitted and indexed") || status.verdict === "PASS";
  const Icon = isIndexed ? CheckCircle2 : XCircle;
  const tone = isIndexed ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        check();
      }}
      title={`${status.coverageState || status.verdict}${status.lastCrawlTime ? ` · 마지막 크롤: ${new Date(status.lastCrawlTime).toLocaleString("ko-KR")}` : ""} — 눌러서 다시 확인`}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${tone}`}
    >
      <Icon size={12} />
      {isIndexed ? "인덱싱됨" : "미인덱싱"}
      <RefreshCw size={10} className="opacity-50" />
    </button>
  );
}
