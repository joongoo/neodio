"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";
import type { RunListRow } from "@/lib/collectionRunList";
import { CategorizeRunModal, CollectionRunList, runColumns } from "./CollectionRunsClient";
import { RequestCollectControl } from "./RequestCollectControl";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import { requestSelectionScope } from "@/lib/requestItemFilters";
import { isRetrySelectable, reconcileRetrySelection, mergeRetrySelection, type RetrySelectionItem } from "@/lib/requestRetrySelection";

export function RequestRunList({ items, requestId, brandId, total, categories, search, orgName, base, serverCollector, downloadPlatforms, loading = false }: {
  items: RequestItemPage; requestId: string; brandId: string; total: number; categories: string[]; search: string;
  orgName: string; base: string; serverCollector: boolean; downloadPlatforms: CollectorPlatform[];
  loading?: boolean;
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [searchText, setSearchText] = useState(search);
  const [analyzing, setAnalyzing] = useState<RunListRow | null>(null);
  const canEdit = useCanEdit();
  const [selected, setSelected] = useState<Map<string, RetrySelectionItem>>(new Map());
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterScope = requestSelectionScope(new URLSearchParams(params.toString()));
  const effectiveSelected = reconcileRetrySelection(selected, items.rows);
  const selectable = items.rows.filter(isRetrySelectable);
  const chosen = [...effectiveSelected.values()];
  async function selectAll() {
    setSelecting(true); setSelectionError(null);
    try {
      const selectionQuery = new URLSearchParams(params.toString()); selectionQuery.set("group", "all");
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/retry?${selectionQuery}`, { cache: "no-store" });
      const data = await response.json();
      if (requestSelectionScope(new URLSearchParams(window.location.search)) !== filterScope) return;
      if (!response.ok) throw new Error(data.error ?? "선택 항목을 조회하지 못했습니다.");
      const candidates = data.items as RetrySelectionItem[];
      const next = mergeRetrySelection(effectiveSelected, candidates, true);
      if (next.size > 2000) throw new Error("한 번에 최대 2,000건까지 선택할 수 있습니다.");
      setSelected(next);
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "선택 항목을 조회하지 못했습니다."); }
    finally { setSelecting(false); }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, [filterScope]);
  function navigate(changes: Record<string, string>) {
    if (timer.current) clearTimeout(timer.current);
    const next = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    window.history.pushState(null, "", `${pathname}?${next}`);
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
  const columns = runColumns(setAnalyzing);
  if (canEdit) columns.unshift({
    key: "select", width: "w-[45px]",
    label: <input type="checkbox" aria-label="현재 페이지 수집 항목 전체 선택" disabled={!selectable.length || selecting || loading}
      checked={selectable.length > 0 && selectable.every(item => effectiveSelected.has(item.id))}
      onChange={event => setSelected(current => mergeRetrySelection(reconcileRetrySelection(current, items.rows), selectable, event.target.checked))} />,
    render: row => {
      const item = items.rows.find(item => item.id === row.key);
      if (!item) return null;
      const allowed = isRetrySelectable(item), retried = item.retries.length > 0;
      if (!allowed && !retried) return null;
      return <input type="checkbox" aria-label={`${row.query} 선택`} title={retried ? "이미 재수집이 요청되었습니다. 연결된 최신 요청에서 확인해 주세요." : undefined}
        disabled={!allowed || selecting || loading} checked={allowed && effectiveSelected.has(row.key)} onClick={event => event.stopPropagation()}
        onChange={event => setSelected(current => mergeRetrySelection(reconcileRetrySelection(current, items.rows), [item], event.target.checked))} />;
    },
  });
  return <>
    <CollectionRunList actions={canEdit && <>
      <RequestCollectControl requestId={requestId} brandId={brandId} orgName={orgName} base={base} serverCollector={serverCollector} downloadPlatforms={downloadPlatforms} selected={loading ? [] : chosen} selecting={selecting || loading} selectableCount={items.facets?.retry.selectable} onSelectAll={selectAll} onClearSelection={() => { setSelected(new Map()); setSelectionError(null); }} onChanged={() => setSelected(new Map())} />
      {selectionError && <p role="alert" className="text-xs text-red-600">{selectionError}</p>}
      <p className="text-xs text-neutral-500">전체 선택은 현재 필터에 맞는 모든 페이지의 선택 가능한 항목에 적용됩니다. 필터 변경 시 선택을 초기화합니다. 미제출 SERP만 선택하면 기존 큐 실행 요청·대기 취소가 가능합니다. 이미 재수집된 원본은 제외합니다.</p>
    </>} loading={loading} listPage={{ ...items, rows }} total={total} searchValue={searchText} onSearchChange={value => {
      setSearchText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim(), page: "1" }), 350);
    }} columns={columns} brandId={brandId} onChanged={() => router.refresh()}
      onPageChange={page => navigate({ page: String(page) })} onPageSizeChange={size => navigate({ size: String(size), page: "1" })} />
    <CategorizeRunModal file={analyzing} categories={categories} onClose={() => setAnalyzing(null)} onSaved={() => { setAnalyzing(null); router.refresh(); }} />
  </>;
}
