"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";
import type { RunListRow } from "@/lib/collectionRunList";
import { CategorizeRunModal, CollectionRunList, runColumns } from "./CollectionRunsClient";

export function RequestRunList({ items, requestId, brandId, total, categories, search }: {
  items: RequestItemPage; requestId: string; brandId: string; total: number; categories: string[]; search: string;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [searchText, setSearchText] = useState(search);
  const [analyzing, setAnalyzing] = useState<RunListRow | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function navigate(changes: Record<string, string>) {
    if (timer.current) clearTimeout(timer.current);
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    router.push(`${pathname}?${next}`);
  }
  const rows: RunListRow[] = items.rows.map(item => {
    const result = item.result;
    const terminalFailure = ["provider_failed", "parse_failed", "submission_unknown", "cancelled"].includes(item.status);
    return {
      key: item.id, dir: result?.dir ?? (item.executionKind === "legacy" ? "legacy-task" : "provider-task"), filename: result?.filename ?? item.id,
      runAt: item.completedAt ?? item.submittedAt ?? item.createdAt,
      source: ({ "google-aio": "google-aio", "google-ai-mode": "google-ai-overview", "naver-aio": "naver-overview", "naver-ai": "naver-ai-search", gemini: "api" } as Record<string, string>)[item.surface] ?? item.surface,
      collectedBy: item.executionKind === "serp-api" ? "dataforseo" : item.surface === "gemini" ? "gemini-api" : "collector", query: item.query, category: result?.category ?? undefined, topic: result?.topic ?? undefined,
      answerLength: result?.answerLength ?? null, citationCount: result?.citationCount ?? null,
      state: terminalFailure ? "failed" : item.status === "completed" ? "success" : "pending",
      progressStatus: item.status, requestId, taskId: item.id, errorMessage: item.errorMessage,
    };
  });
  return <>
    <CollectionRunList listPage={{ ...items, rows }} total={total} searchValue={searchText} onSearchChange={value => {
      setSearchText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim(), page: "1" }), 350);
    }} columns={runColumns(setAnalyzing)} brandId={brandId} onChanged={() => router.refresh()}
      onPageChange={page => navigate({ page: String(page) })} onPageSizeChange={size => navigate({ size: String(size), page: "1" })} />
    <CategorizeRunModal file={analyzing} categories={categories} onClose={() => setAnalyzing(null)} onSaved={() => { setAnalyzing(null); router.refresh(); }} />
  </>;
}
