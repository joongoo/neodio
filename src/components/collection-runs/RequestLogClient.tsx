"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCanEdit } from "@/components/auth/PermissionsProvider";
import { Pagination } from "@/components/ui/Pagination";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { RequestLogPage } from "@/lib/backend/dataforseo/requestLog";
import { formatKst } from "@/lib/backend/collectionRunsTypes";
import { RequestDetailFilters } from "./RequestDetailFilters";
import { RequestAttentionCard } from "./RequestAttentionCard";
import { RequestRowLink } from "./RequestRowLink";
import { RequestStatusBadge, surfaceLabel, usd } from "./RequestLogViews";

type Page = RequestLogPage & { attentionCount: number };
export function RequestLogClient({ path, initial, initialQuery }: { path: string; initial: Page; initialQuery: string }) {
  const router = useRouter(), search = useSearchParams(), canEdit = useCanEdit();
  const params = new URLSearchParams(search.toString());
  params.delete("q");
  const query = params.toString();
  const attention = params.get("attention") === "1" || (params.get("status") ?? "").split(",").includes("needs_attention");
  const [result, setResult] = useState({ query: initialQuery, data: initial });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      if (query === initialQuery && revision === 0) { setLoading(false); setError(""); return null; }
      setLoading(true); setError("");
      return fetch(`/api/collection-requests?${query}`, { signal: controller.signal, cache: "no-store" });
    })
      .then(async response => { if (!response) return null; if (!response.ok) throw new Error("수집 요청을 불러오지 못했습니다."); return response.json() as Promise<Page>; })
      .then(data => { if (data && !controller.signal.aborted) setResult({ query, data }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "조회에 실패했습니다."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, initialQuery, initial, revision]);
  const change = (changes: Record<string, string>) => {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(changes)) { next.delete(key); if (value) next.set(key, value); }
    window.history.pushState(null, "", `${path}?${next}`);
  };
  const setAttention = (active: boolean) => change({ attention: active ? "1" : "", status: (params.get("status") ?? "").split(",").filter(value => value && value !== "needs_attention").join(","), page: "1" });
  const review = async (id: string) => {
    if (reviewing) return;
    setReviewing(id); setReviewError("");
    try {
      const response = await fetch(`/api/collection-requests/${encodeURIComponent(id)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewed: true }) });
      if (!response.ok) throw new Error("확인 완료를 저장하지 못했습니다.");
      setReviewTarget(null); setRevision(value => value + 1); router.refresh();
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : "저장에 실패했습니다."); }
    finally { setReviewing(null); }
  };
  const atInitial = query === initialQuery && revision === 0;
  const data = atInitial ? initial : result.data, pending = !atInitial && (loading || (!error && result.query !== query));
  return <section className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-bold">수집 로그</h1><p className="mt-1 text-sm text-neutral-500">수집 요청별 진행 상황과 결과를 확인합니다.</p></div><Link href={`${path}?view=items`} className="rounded-md bg-neutral-100 px-3.5 py-2 text-sm">이전 개별 수집 이력</Link></header>
    <RequestAttentionCard count={data.attentionCount} path={path} active={attention} onFilter={setAttention} />
    <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">요청 연결 정보가 없는 과거 버전의 실행은 이전 개별 수집 이력에서 확인할 수 있습니다.</p>
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      <RequestDetailFilters mode="requests" query={query} onChange={change} />
      <label className="flex cursor-pointer items-center gap-2 py-2 text-sm"><button type="button" role="switch" aria-label="확인 필요만 보기" aria-checked={attention} onClick={() => setAttention(!attention)} className={`relative h-5 w-9 rounded-full ${attention ? "bg-slate-800" : "bg-neutral-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${attention ? "left-0.5 translate-x-4" : "left-0.5"}`} /></button>확인 필요만 보기</label>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>다시 조회</button></p>}
    {pending && <p role="status" className="text-sm text-neutral-500">조회 중…</p>}
    <div aria-busy={pending} className="overflow-hidden rounded-xl border border-neutral-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-left text-xs text-neutral-700"><thead className="border-b border-neutral-200 text-neutral-500"><tr>{["수집 요청", "등록 시각", "요청자", "엔진", "상태", "완료 / 전체", "실패 / 제출 불명확", "확인 필요", "예상 / 실제 USD"].map(label => <th key={label} className="whitespace-nowrap px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>
      {!pending && !error && data.rows.map(row => {
        const href = `${path}/${encodeURIComponent(row.id)}?${new URLSearchParams({ back: query })}`;
        return <RequestRowLink key={row.id} label={`수집 요청 ${row.id} 상세 보기`} href={href}>
          <td className="px-5 py-3"><Link href={href} title={row.id} className="block max-w-40 truncate font-medium hover:underline">{row.id}</Link></td>
          <td className="whitespace-nowrap px-5 py-3">{formatKst(row.createdAt)}</td><td className="whitespace-nowrap px-5 py-3">{row.requestedBy?.name ?? "-"}</td>
          <td className="min-w-36 px-5 py-3">{row.surfaces.map(surfaceLabel).join(", ")}</td><td className="whitespace-nowrap px-5 py-3"><RequestStatusBadge status={row.status} /></td>
          <td className="whitespace-nowrap px-5 py-3">{row.counts.completed} / {row.counts.total}</td><td className="whitespace-nowrap px-5 py-3">{row.counts.failed} / {row.counts.attention}</td>
          <td className="whitespace-nowrap px-5 py-3">{row.needsAttention ? <div className="flex items-center gap-2"><span className="text-amber-700">확인 필요</span>{canEdit && <button type="button" disabled={!!reviewing} onClick={() => { setReviewError(""); setReviewTarget(row.id); }} className="cursor-pointer rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40">{reviewing === row.id ? "저장 중…" : "확인 완료"}</button>}</div> : row.attentionReviewed ? "확인 완료" : "-"}</td>
          <td className="whitespace-nowrap px-5 py-3">{usd(row.estimatedCostUsd)} / {usd(row.actualCostUsd)}</td>
        </RequestRowLink>;
      })}
      {!pending && !error && data.rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-neutral-500">조건에 맞는 수집 요청이 없습니다.</td></tr>}
    </tbody></table></div><div className="border-t border-neutral-200 px-5 py-2"><Pagination page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} totalCount={data.filteredTotal} onPageChange={page => change({ page: String(page) })} onPageSizeChange={size => change({ size: String(size), page: "1" })} /></div></div>
    <Modal open={reviewTarget !== null} onClose={() => { if (!reviewing) setReviewTarget(null); }}>
      <h2 className="text-lg font-semibold text-neutral-900">확인 완료로 처리할까요?</h2>
      <p className="mt-3 text-sm leading-6 text-neutral-600">이 요청을 확인 필요 목록과 알림에서 제외합니다. 실패 이력은 그대로 유지되며, 재수집이나 작업 취소는 실행되지 않습니다.</p>
      <p className="mt-2 text-sm leading-6 text-neutral-600">이후 새로운 제출 실패가 발생하면 다시 확인 필요로 표시됩니다.</p>
      <p className="mt-3 break-all text-xs text-neutral-400">{reviewTarget}</p>
      {reviewError && <p role="alert" className="mt-3 text-sm text-red-700">{reviewError}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button disabled={!!reviewing} onClick={() => setReviewTarget(null)} className="disabled:cursor-not-allowed disabled:opacity-40">취소</Button>
        <Button variant="primary" disabled={!!reviewing} onClick={() => { if (reviewTarget) void review(reviewTarget); }} className="disabled:cursor-not-allowed disabled:opacity-40">{reviewing ? "저장 중…" : "확인 완료"}</Button>
      </div>
    </Modal>
  </section>;
}
