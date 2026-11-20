"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { CITATION_ENGINES } from "@/lib/citationEngines";
import type { PromptSurface } from "@/lib/promptSurfaces";

const ranges: Record<string, string> = { "1w": "최근 1주", "2w": "최근 2주", "4w": "최근 4주", "12w": "최근 12주" };
const filters: Record<string, string> = { all: "전체", own: "우리 채널 인용", youtube: "YouTube 인용", unknown: "채널 미확인 포함", none: "영상 인용 없음" };

function useCitationNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = useRef(searchParams.toString());
  useEffect(() => { current.current = searchParams.toString(); }, [searchParams]);
  const [pending, start] = useTransition();
  function navigate(changes: Record<string, string>, replace = false) {
    const params = new URLSearchParams(current.current);
    params.delete("run");
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    start(() => { if (replace) router.replace(`${pathname}?${params}`, { scroll: false }); else router.push(`${pathname}?${params}`, { scroll: false }); });
  }
  return { navigate, pending };
}

export function CitationToolbar({ engine, range, from, to }: { engine: PromptSurface; range: string; from: string; to: string }) {
  const { navigate, pending } = useCitationNavigation();
  return <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
    <Dropdown label="엔진" value={CITATION_ENGINES[engine]} options={Object.values(CITATION_ENGINES)} onChange={label => {
      const selected = Object.entries(CITATION_ENGINES).find(([, value]) => value === label)?.[0];
      if (selected) navigate({ engine: selected, q: "", citation: "", promptPage: "1", videoPage: "1" });
    }} />
    <Dropdown label="기간" value={ranges[range]} options={Object.values(ranges)} onChange={label => {
      const selected = Object.entries(ranges).find(([, value]) => value === label)?.[0];
      if (selected) navigate({ range: selected, promptPage: "1", videoPage: "1" });
    }} />
    <span className="text-xs text-neutral-500">{from} – {to} (KST)</span>
    {pending && <Loader2 size={16} className="animate-spin text-neutral-400" aria-label="인용 현황 불러오는 중" role="status" />}
  </div>;
}

export function CitationTableFilters({ query, citation }: { query: string; citation: string }) {
  const { navigate, pending } = useCitationNavigation();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const submitted = useRef(new Set<string>());
  useEffect(() => {
    if (submitted.current.delete(query)) return;
    if (timer.current) clearTimeout(timer.current);
    if (input.current) input.current.value = query;
  }, [query]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function search(value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = value.trim();
      submitted.current.add(q);
      navigate({ q, promptPage: "1" }, true);
    }, 300);
  }
  return <div className="flex flex-wrap items-end gap-2">
    <div className="flex flex-col gap-1.5"><span className="text-xs text-neutral-500">YouTube 인용 유형</span>
      <Dropdown label="" value={filters[citation] ?? filters.all} options={Object.values(filters)} onChange={label => {
        if (timer.current) clearTimeout(timer.current);
        navigate({ citation: Object.entries(filters).find(([, value]) => value === label)?.[0] ?? "all", q: input.current?.value ?? query, promptPage: "1" });
      }} />
    </div>
    <div className="ml-auto flex items-end gap-2">
      <label className="flex flex-col gap-1.5"><span className="text-xs text-neutral-500">프롬프트 검색</span><span className="relative">
        <input ref={input} type="search" defaultValue={query} maxLength={500} placeholder="프롬프트 키워드 입력" aria-busy={pending}
          onChange={event => { if (!composing.current) search(event.target.value); }}
          onCompositionStart={() => { composing.current = true; if (timer.current) clearTimeout(timer.current); }}
          onCompositionEnd={event => { composing.current = false; search(event.currentTarget.value); }}
          className="w-52 rounded-md border border-neutral-300 py-2 pl-3 pr-9 text-sm [&::-webkit-search-cancel-button]:appearance-none" />
        {pending && <Loader2 size={16} role="status" aria-label="검색 결과 불러오는 중" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-neutral-400" />}
      </span></label>
      <button type="button" aria-label="필터 초기화" title="필터 초기화" onClick={() => {
        if (timer.current) clearTimeout(timer.current);
        submitted.current.clear();
        if (input.current) input.current.value = "";
        navigate({ q: "", citation: "", promptPage: "1" });
      }} className="rounded-md p-2.5 text-neutral-500 hover:bg-neutral-100"><RotateCcw size={18} aria-hidden="true" /></button>
    </div>
  </div>;
}

export function CitationPager({ page, pageCount, total, pageSize, kind }: { page: number; pageCount: number; total: number; pageSize: number; kind: "prompt" | "video" }) {
  const { navigate } = useCitationNavigation();
  return <Pagination page={page} pageCount={pageCount} totalCount={total} pageSize={pageSize}
    onPageChange={value => navigate({ [kind === "prompt" ? "promptPage" : "videoPage"]: String(value) })}
    onPageSizeChange={value => navigate({ [kind === "prompt" ? "size" : "videoSize"]: String(value), [kind === "prompt" ? "promptPage" : "videoPage"]: "1" })} />;
}

export function CitationExportButton({ rows, filename }: { rows: string[][]; filename: string }) {
  function download() {
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replace(/"/g, '""')}"`;
    const header = ["프롬프트", "측정 상태", "YouTube 영상", "우리 채널", "수집일"];
    const csv = [header, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }
  return <Button variant="secondary" icon={<Download size={16} />} disabled={!rows.length} onClick={download}>스냅샷 내보내기</Button>;
}
