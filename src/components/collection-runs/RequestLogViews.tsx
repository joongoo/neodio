import Link from "next/link";
import { formatKst } from "@/lib/backend/collectionRunsTypes";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import { SURFACE_LABEL } from "@/lib/promptSurfaces";
import type { PromptSurface } from "@/lib/promptSurfaces";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  queued: "대기", running: "진행 중", completed: "완료", partially_failed: "일부 실패", needs_attention: "확인 필요", cancelled: "취소",
  reserved: "수집 대기", submitting: "제출 중", submission_unknown: "제출 확인 필요", collecting: "수집 중",
  raw_saved: "원본 저장 완료", normalized: "결과 반영 중", provider_failed: "제출 실패", artifact_failed: "원본 저장 재처리 중", projection_failed: "결과 반영 재처리 중", parse_failed: "분석 실패",
};
export const surfaceLabel = (surface: string) => SURFACE_LABEL[surface as PromptSurface] ?? surface;
export function requestItemStatusLabel(status: string, serpApi: boolean): string {
  if (serpApi && status === "reserved") return "제출 중";
  if (status === "queued") return "수집 중";
  return REQUEST_STATUS_LABEL[status] ?? status;
}
export const usd = (cost: number) => cost === 0 ? "-" : `$${cost.toFixed(4)}`;

export function RequestStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-amber-100 text-amber-800", running: "bg-blue-100 text-blue-800",
    completed: "bg-emerald-100 text-emerald-800", partially_failed: "bg-red-100 text-red-800",
    needs_attention: "bg-orange-100 text-orange-800", cancelled: "bg-neutral-100 text-neutral-600",
  };
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold ${colors[status] ?? colors.cancelled}`}>{REQUEST_STATUS_LABEL[status] ?? status}</span>;
}
export const fieldClass = "h-9 min-w-0 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-slate-300";

export function RequestSummary({ request, actions }: { request: RequestLogRow; actions?: ReactNode }) {
  return <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><RequestExecutionBadge request={request} /><span className="text-sm text-neutral-500">{formatKst(request.createdAt)} · {request.requestedBy?.name ?? "요청자 정보 없음"}</span></div>{actions}</div>
  </div>;
}

export function RequestExecutionBadge({ request }: { request: RequestLogRow }) {
  const active = request.counts.running > 0;
  if (!request.cancelRequested && !active) return <RequestStatusBadge status={request.status} />;
  const progress = request.counts.total > 0 ? Math.min(100, Math.floor((request.counts.completed + request.counts.failed + request.counts.cancelled) / request.counts.total * 100)) : 0;
  return <span title="진행률은 전체 항목 중 완료·실패·취소로 처리가 끝난 비율입니다." className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold ${active ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-600"}`}>{active && <Loader2 size={12} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}{request.cancelRequested ? active ? "취소 중" : "취소" : "진행 중"}{active && <span className="ml-1 tabular-nums">{progress}%</span>}</span>;
}

export function RequestPageLinks({ path, query, page, pageCount, total }: { path: string; query: URLSearchParams; page: number; pageCount: number; total: number }) {
  const href = (target: number) => { const next = new URLSearchParams(query); next.set("page", String(target)); return `${path}?${next}`; };
  return <nav aria-label="페이지 이동" className="flex flex-wrap items-center justify-end gap-3 py-4 text-xs text-neutral-500">
    <span>총 {total}건 · {page} / {pageCount} 페이지</span>
    {page > 1 && <Link className="underline" href={href(page - 1)}>이전</Link>}
    {page < pageCount && <Link className="underline" href={href(page + 1)}>다음</Link>}
  </nav>;
}

export function RequestFilters({ path, query, itemMode = false }: { path: string; query: URLSearchParams; itemMode?: boolean }) {
  const statuses = itemMode
    ? ["reserved", "submitting", "submission_unknown", "queued", "collecting", "completed", "provider_failed", "artifact_failed", "projection_failed", "parse_failed", "cancelled"]
    : ["queued", "running", "completed", "partially_failed", "needs_attention", "cancelled"];
  return <form action={path} className="flex flex-wrap items-center gap-3">
    {!itemMode && query.get("attention") === "1" && <input type="hidden" name="attention" value="1" />}
    {query.has("view") && <input type="hidden" name="view" value={query.get("view")!} />}
    {query.has("back") && <input type="hidden" name="back" value={query.get("back")!} />}
    {itemMode ? <input type="hidden" name="q" value={query.get("q") ?? ""} /> : <input aria-label="검색어" name="q" defaultValue={query.get("q") ?? ""} placeholder="프롬프트·요청 검색" className={fieldClass} />}
    <select aria-label="상태" name="status" defaultValue={query.get("status") ?? ""} className={fieldClass}><option value="">전체 상태</option>{statuses.map(s => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}</select>
    <select aria-label="엔진" name="surface" defaultValue={query.get("surface") ?? ""} className={fieldClass}><option value="">전체 엔진</option>{["google-aio", "google-ai-mode", "naver-aio", "naver-ai", "gemini"].map(s => <option key={s} value={s}>{surfaceLabel(s)}</option>)}</select>
    <select aria-label="정렬" name="sort" defaultValue={query.get("sort") ?? (itemMode ? "oldest" : "newest")} className={fieldClass}><option value="newest">최신순</option><option value="oldest">오래된순</option></select>
    {itemMode ? <input type="hidden" name="size" value={query.get("size") ?? "25"} /> : <select aria-label="페이지 크기" name="size" defaultValue={query.get("size") ?? "25"} className={fieldClass}>{[10, 25, 50].map(n => <option key={n} value={n}>{n}개씩</option>)}</select>}
    <button type="submit" className="h-9 rounded-md bg-slate-800 px-3.5 text-sm font-medium text-white hover:opacity-90">조회</button>
  </form>;
}
