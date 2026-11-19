import Link from "next/link";
import { formatKst } from "@/lib/backend/collectionRunsTypes";
import type { RequestLogRow } from "@/lib/backend/dataforseo/requestLog";
import { RequestStatusBadge } from "./RequestLogViews";

export function RequestRelations({ parent, retries, total, page, pageCount, path, query, listPath, itemCount }: {
  parent: RequestLogRow | null; retries: RequestLogRow[]; total: number; page: number; pageCount: number;
  path: string; query: string; listPath: string;
  itemCount: number;
}) {
  if (!parent && !total) return null;
  const href = (id: string) => `${listPath}/${encodeURIComponent(id)}`;
  function pageHref(target: number) { const next = new URLSearchParams(query); next.set("retriesPage", String(target)); return `${path}?${next}`; }
  return <section aria-label="연결된 수집 요청" className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
    {parent && <div className="space-y-2">
      <h2 className="text-sm font-semibold text-neutral-900">원본 요청에서 {itemCount}건 재수집</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs"><Link href={href(parent.id)} className="break-all font-medium text-slate-700 underline">원본 요청 보기 · {parent.id}</Link><RequestStatusBadge status={parent.status} /></div>
    </div>}
    {total > 0 && <div className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-900">재수집 요청 <span className="font-normal text-neutral-500">{total}건</span></h2>
      <p className="text-xs text-neutral-500">원본 결과는 보존됩니다. 이후 수집 현황과 결과는 아래 요청에서 확인하세요.</p>
      <ul className="divide-y divide-neutral-100">{retries.map(retry => <li key={retry.id} className="py-2 first:pt-0 last:pb-0">
        <Link href={href(retry.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md text-xs hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-slate-400">
          <span className="min-w-0 space-y-1"><span className="block break-all font-medium text-slate-700 underline">{retry.id}</span><span className="block text-neutral-500">{formatKst(retry.createdAt)} · 완료 {retry.counts.completed} / {retry.counts.total}건</span></span>
          <RequestStatusBadge status={retry.status} />
        </Link>
      </li>)}</ul>
      {pageCount > 1 && <nav aria-label="재수집 요청 페이지 이동" className="flex justify-end gap-3 text-xs text-neutral-500">{page > 1 && <Link href={pageHref(page - 1)} className="underline">이전</Link>}<span>{page} / {pageCount}</span>{page < pageCount && <Link href={pageHref(page + 1)} className="underline">다음</Link>}</nav>}
    </div>}
  </section>;
}
