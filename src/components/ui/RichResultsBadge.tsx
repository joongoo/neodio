"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Loader2, TriangleAlert } from "lucide-react";
import { GscUrlIndexStatus } from "@/lib/db";

// URL Inspection API 응답 중 richResultsResult(구조화 데이터 감지/검증 결과) —
// 인덱싱 상태(GoogleIndexBadge)와 같은 API 호출에서 이미 받아오는 필드라
// 추가 쿼터 없이 붙인다. "FAQ 추가" 같은 콘텐츠 기회를 실행한 뒤, 검색 성과
// 데이터가 쌓이길 기다리지 않고도 "구글이 우리 FAQ 스키마를 실제로 인식했는지"를
// 재크롤 즉시 확인할 수 있다.
export function RichResultsBadge({ url, status }: { url: string; status?: GscUrlIndexStatus }) {
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

  const richResults = status?.richResults;
  if (!status || !richResults) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          check();
        }}
        title={error ?? "구글 인덱싱 확인과 같은 API로 구조화 데이터도 함께 확인합니다."}
        className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-500 cursor-pointer hover:bg-neutral-200"
      >
        <HelpCircle size={12} />
        {error ? "다시 시도" : "구조화 데이터 확인"}
      </button>
    );
  }

  if (richResults.items.length === 0) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          check();
        }}
        title="구글이 이 URL에서 감지한 구조화 데이터(FAQ 스키마 등)가 없습니다 — 눌러서 다시 확인"
        className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-500 cursor-pointer hover:bg-neutral-200"
      >
        <HelpCircle size={12} />
        미감지
      </button>
    );
  }

  const errorCount = richResults.items.reduce(
    (sum, item) => sum + item.issues.filter((i) => i.severity === "ERROR").length,
    0
  );
  const types = [...new Set(richResults.items.map((i) => i.richResultType))].join(", ");
  const isOk = errorCount === 0;
  const Icon = isOk ? CheckCircle2 : TriangleAlert;
  const tone = isOk ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        check();
      }}
      title={`감지된 유형: ${types}${errorCount > 0 ? ` · 오류 ${errorCount}건` : " · 오류 없음"} — 눌러서 다시 확인`}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${tone}`}
    >
      <Icon size={12} />
      {isOk ? `${types} 정상` : `오류 ${errorCount}건`}
    </button>
  );
}
