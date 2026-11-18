"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";
import type { RunListRow } from "@/lib/collectionRunList";
import { CategorizeRunModal, CollectionRunList, runColumns } from "./CollectionRunsClient";
import { RequestCollectControl } from "./RequestCollectControl";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import { isRetrySelectable, type RetrySelectionItem } from "@/lib/requestRetrySelection";

export function RequestRunList({ items, requestId, brandId, total, categories, search, orgName, base, serverCollector, downloadPlatforms }: {
  items: RequestItemPage; requestId: string; brandId: string; total: number; categories: string[]; search: string;
  orgName: string; base: string; serverCollector: boolean; downloadPlatforms: CollectorPlatform[];
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [searchText, setSearchText] = useState(search);
  const [analyzing, setAnalyzing] = useState<RunListRow | null>(null);
  const canEdit = useCanEdit();
  const [selected, setSelected] = useState<Map<string, RetrySelectionItem>>(new Map());
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectable = items.rows.filter(isRetrySelectable);
  const chosen = [...selected.values()];
  async function selectFailures() {
    setSelecting(true); setSelectionError(null);
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/retry`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "실패 항목을 조회하지 못했습니다.");
      setSelected(new Map((data.items as RetrySelectionItem[]).map(item => [item.id, item])));
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "실패 항목을 조회하지 못했습니다."); }
    finally { setSelecting(false); }
  }
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
      retryRequests: item.retries.map(retry => ({ href: `${base}/collection-runs/${encodeURIComponent(retry.requestId)}`, status: retry.status })),
    };
  });
  return <>
    <CollectionRunList actions={canEdit && <>
      <RequestCollectControl requestId={requestId} brandId={brandId} orgName={orgName} base={base} serverCollector={serverCollector} downloadPlatforms={downloadPlatforms} selected={chosen} selecting={selecting} onSelectFailures={selectFailures} onChanged={() => setSelected(new Map())} />
      {selectionError && <p role="alert" className="text-xs text-red-600">{selectionError}</p>}
      <p className="text-xs text-neutral-500">실패 항목 전체 선택은 필터와 관계없이 이 요청의 모든 페이지에 적용됩니다. 제출 여부 확인 필요·저장 결과 복구 대상은 유료 재수집에서 제외합니다.</p>
    </>} listPage={{ ...items, rows }} total={total} searchValue={searchText} onSearchChange={value => {
      setSearchText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim(), page: "1" }), 350);
    }} columns={[...(canEdit ? [{ key: "select", width: "w-[45px]", label: <input type="checkbox" aria-label="현재 페이지 수집 항목 전체 선택" disabled={!selectable.length || selecting} checked={selectable.length > 0 && selectable.every(item => selected.has(item.id))} onChange={e => setSelected(current => { const next = new Map(current); for (const item of selectable) { if (e.target.checked) next.set(item.id, item); else next.delete(item.id); } return next; })} />, render: (row: RunListRow) => selectable.some(item => item.id === row.key) ? <input type="checkbox" aria-label={`${row.query} 선택`} disabled={selecting} checked={selected.has(row.key)} onClick={e => e.stopPropagation()} onChange={e => setSelected(current => { const next = new Map(current); if (e.target.checked) next.set(row.key, selectable.find(item => item.id === row.key)!); else next.delete(row.key); return next; })} /> : null }] : []), ...runColumns(setAnalyzing)]} brandId={brandId} onChanged={() => router.refresh()}
      onPageChange={page => navigate({ page: String(page) })} onPageSizeChange={size => navigate({ size: String(size), page: "1" })} />
    <CategorizeRunModal file={analyzing} categories={categories} onClose={() => setAnalyzing(null)} onSaved={() => { setAnalyzing(null); router.refresh(); }} />
  </>;
}
