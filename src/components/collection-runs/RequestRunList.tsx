"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";
import type { RunListRow } from "@/lib/collectionRunList";
import { CategorizeRunModal, CollectionRunList, runColumns } from "./CollectionRunsClient";
import { RequestCollectControl } from "./RequestCollectControl";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import type { CollectorPlatform } from "@/lib/collectorAgent";
import { isRetrySelectable, reconcileRetrySelection, retryGroupSelected, mergeRetrySelection, type RetrySelectionItem, type RetrySelectionGroup } from "@/lib/requestRetrySelection";

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
  const [groupCandidates, setGroupCandidates] = useState<Record<RetrySelectionGroup, RetrySelectionItem[]>>({ failed: [], cancelled: [] });
  const effectiveSelected = reconcileRetrySelection(selected, items.rows);
  const selectable = items.rows.filter(isRetrySelectable);
  const chosen = [...effectiveSelected.values()];
  const groupsSelected = { failed: retryGroupSelected(effectiveSelected, groupCandidates.failed), cancelled: retryGroupSelected(effectiveSelected, groupCandidates.cancelled) };
  async function selectGroup(group: RetrySelectionGroup) {
    if (groupsSelected[group]) { setSelected(mergeRetrySelection(effectiveSelected, groupCandidates[group], false)); return; }
    setSelecting(true); setSelectionError(null);
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(requestId)}/retry?group=${group}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "선택 항목을 조회하지 못했습니다.");
      const candidates = data.items as RetrySelectionItem[];
      const next = mergeRetrySelection(effectiveSelected, candidates, true);
      if (next.size > 2000) throw new Error("한 번에 최대 2,000건까지 선택할 수 있습니다.");
      setGroupCandidates(current => ({ ...current, [group]: candidates }));
      setSelected(next);
    } catch (error) { setSelectionError(error instanceof Error ? error.message : "선택 항목을 조회하지 못했습니다."); }
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
  const columns = runColumns(setAnalyzing);
  if (canEdit) columns.unshift({
    key: "select", width: "w-[45px]",
    label: <input type="checkbox" aria-label="현재 페이지 수집 항목 전체 선택" disabled={!selectable.length || selecting}
      checked={selectable.length > 0 && selectable.every(item => effectiveSelected.has(item.id))}
      onChange={event => setSelected(current => mergeRetrySelection(reconcileRetrySelection(current, items.rows), selectable, event.target.checked))} />,
    render: row => {
      const item = items.rows.find(item => item.id === row.key);
      if (!item) return null;
      const allowed = isRetrySelectable(item), retried = item.retries.length > 0;
      if (!allowed && !retried) return null;
      return <input type="checkbox" aria-label={`${row.query} 선택`} title={retried ? "이미 재수집이 요청되었습니다. 연결된 최신 요청에서 확인해 주세요." : undefined}
        disabled={!allowed || selecting} checked={allowed && effectiveSelected.has(row.key)} onClick={event => event.stopPropagation()}
        onChange={event => setSelected(current => mergeRetrySelection(reconcileRetrySelection(current, items.rows), [item], event.target.checked))} />;
    },
  });
  return <>
    <CollectionRunList actions={canEdit && <>
      <RequestCollectControl requestId={requestId} brandId={brandId} orgName={orgName} base={base} serverCollector={serverCollector} downloadPlatforms={downloadPlatforms} selected={chosen} selecting={selecting} onSelectGroup={selectGroup} groupsSelected={groupsSelected} onClearSelection={() => { setSelected(new Map()); setSelectionError(null); }} onChanged={() => setSelected(new Map())} />
      {selectionError && <p role="alert" className="text-xs text-red-600">{selectionError}</p>}
      <p className="text-xs text-neutral-500">실패·취소 전체 선택은 모든 페이지에 누적 적용되며, 같은 버튼으로 해당 그룹만 해제합니다. 미제출 SERP 작업만 선택하면 기존 큐 실행 요청·대기 취소가 가능합니다. 이미 재수집된 원본·제출 여부 확인 필요·저장 결과 복구 대상은 제외합니다.</p>
    </>} listPage={{ ...items, rows }} total={total} searchValue={searchText} onSearchChange={value => {
      setSearchText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim(), page: "1" }), 350);
    }} columns={columns} brandId={brandId} onChanged={() => router.refresh()}
      onPageChange={page => navigate({ page: String(page) })} onPageSizeChange={size => navigate({ size: String(size), page: "1" })} />
    <CategorizeRunModal file={analyzing} categories={categories} onClose={() => setAnalyzing(null)} onSaved={() => { setAnalyzing(null); router.refresh(); }} />
  </>;
}
