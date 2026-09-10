"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Loader2 } from "lucide-react";
import { PageSpeedResult } from "@/lib/db";

// PageSpeed Insights(CrUX 실사용자 데이터 우선, 없으면 Lighthouse 추정치) —
// 느린 페이지는 AI 크롤러도 렌더링 타임아웃으로 못 읽을 수 있어 콘텐츠
// 가시성 진단의 보조 근거로 쓴다. 클릭하면 그 자리에서 다시 확인한다.
export function PageSpeedBadge({ url, result }: { url: string; result?: PageSpeedResult }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/pagespeed-insights", {
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
        <Loader2 size={12} className="animate-spin" /> 측정 중...
      </span>
    );
  }

  if (!result || result.performanceScore === null) {
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
        <Gauge size={12} />
        {error ? "다시 시도" : "속도 확인"}
      </button>
    );
  }

  const score = result.performanceScore;
  const tone = score >= 90 ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : score >= 50 ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        check();
      }}
      title={`${result.hasFieldData ? "실사용자 데이터" : "Lighthouse 추정치"}${result.lcpMs != null ? ` · LCP ${(result.lcpMs / 1000).toFixed(1)}s` : ""}${result.cls != null ? ` · CLS ${result.cls.toFixed(2)}` : ""} — 눌러서 다시 확인`}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${tone}`}
    >
      <Gauge size={12} />
      {score}점
    </button>
  );
}
