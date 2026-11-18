"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { RequestItemPage } from "@/lib/backend/dataforseo/requestItems";
import type { RunListRow } from "@/lib/collectionRunList";
import { CategorizeRunModal, CollectionRunList, runColumns } from "./CollectionRunsClient";
import { LegacyRetryControl } from "./LegacyRetryControl";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import type { CollectorPlatform } from "@/lib/collectorAgent";

export function RequestRunList({ items, requestId, brandId, total, categories, search, orgName, base, serverCollector, downloadPlatforms }: {
  items: RequestItemPage; requestId: string; brandId: string; total: number; categories: string[]; search: string;
  orgName: string; base: string; serverCollector: boolean; downloadPlatforms: CollectorPlatform[];
}) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [searchText, setSearchText] = useState(search);
  const [analyzing, setAnalyzing] = useState<RunListRow | null>(null);
  const canEdit = useCanEdit();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectable = items.rows.filter(item => item.executionKind === "legacy" && ["reserved", "collecting", "parse_failed", "provider_failed", "cancelled"].includes(item.status));
  const chosen = selectable.filter(item => selected.has(item.id));
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
    {canEdit && selectable.length > 0 && <LegacyRetryControl requestId={requestId} brandId={brandId} orgName={orgName} base={base} serverCollector={serverCollector} downloadPlatforms={downloadPlatforms} selected={chosen} onChanged={() => setSelected(new Set())} />}
    <CollectionRunList listPage={{ ...items, rows }} total={total} searchValue={searchText} onSearchChange={value => {
      setSearchText(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => navigate({ q: value.trim(), page: "1" }), 350);
    }} columns={[...(canEdit ? [{ key: "select", width: "w-[45px]", label: <input type="checkbox" aria-label="현재 페이지 로컬 수집 전체 선택" disabled={!selectable.length} checked={selectable.length > 0 && chosen.length === selectable.length} onChange={e => setSelected(new Set(e.target.checked ? selectable.map(item => item.id) : []))} />, render: (row: RunListRow) => selectable.some(item => item.id === row.key) ? <input type="checkbox" aria-label={`${row.query} 선택`} checked={selected.has(row.key)} onClick={e => e.stopPropagation()} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(row.key); else next.delete(row.key); return next; })} /> : null }] : []), ...runColumns(setAnalyzing)]} brandId={brandId} onChanged={() => router.refresh()}
      onPageChange={page => navigate({ page: String(page) })} onPageSizeChange={size => navigate({ size: String(size), page: "1" })} />
    <CategorizeRunModal file={analyzing} categories={categories} onClose={() => setAnalyzing(null)} onSaved={() => { setAnalyzing(null); router.refresh(); }} />
  </>;
}
