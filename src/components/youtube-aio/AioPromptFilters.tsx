"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, Search } from "lucide-react";
import { AIO_FILTER_OPTIONS, aioFilterValues, type AioPromptFacets } from "@/lib/aioPromptTable";

export function AioPromptFilters({ query, facets, onChange }: { query: string; facets: AioPromptFacets; onChange: (changes: Record<string, string>) => void }) {
  const params = new URLSearchParams(query);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <div ref={root} className="flex flex-wrap items-end gap-3" aria-label="프롬프트 인용 필터">
    {AIO_FILTER_OPTIONS.map(field => {
      const selected = aioFilterValues(params, field.key);
      return <div key={field.key} className="relative flex flex-col gap-1.5"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(current => current === field.key ? null : current); }}
        onKeyDown={event => { if (event.key === "Escape") { setOpen(null); event.currentTarget.querySelector("button")?.focus(); } }}>
        <span className="text-xs text-neutral-500">{field.label}</span>
        <button type="button" aria-expanded={open === field.key} onClick={() => setOpen(current => current === field.key ? null : field.key)} className="inline-flex cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-md bg-slate-800 px-3.5 py-2 text-sm text-white">
          <span>{selected.length ? field.options.filter(option => selected.includes(option.value)).map(option => option.label).join(", ") : "전체"}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
        <div hidden={open !== field.key} className="absolute left-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
          <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-50" onClick={() => onChange({ [field.key]: "", page: "1" })}>전체</button>
          {field.options.map(option => {
            const checked = selected.includes(option.value);
            const count = facets[field.key][option.value] ?? 0;
            const disabled = count === 0 && !checked;
            return <button type="button" role="checkbox" aria-checked={checked} aria-disabled={disabled} disabled={disabled} key={option.value}
              onClick={() => onChange({ [field.key]: (checked ? selected.filter(value => value !== option.value) : [...selected, option.value]).join(","), page: "1" })}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-neutral-50"}`}>
              <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-400 bg-white"}`}>{checked && <Check size={12} />}</span>
              {option.label}
              <span className="ml-auto text-xs tabular-nums text-neutral-500">{count.toLocaleString("ko-KR")}</span>
            </button>;
          })}
        </div>
      </div>;
    })}
    <div className="ml-auto flex items-end gap-2">
    <form className="flex items-end gap-2" onSubmit={event => {
      event.preventDefault();
      onChange({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim(), page: "1" });
    }}>
      <label className="flex flex-col gap-1.5"><span className="text-xs text-neutral-500">프롬프트 검색</span>
        <input key={params.get("q") ?? ""} type="search" name="q" defaultValue={params.get("q") ?? ""} placeholder="프롬프트 키워드 입력" onFocus={() => setOpen(null)} className="w-52 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      </label>
      <button type="submit" aria-label="프롬프트 검색" className="rounded-md bg-slate-800 p-2.5 text-white"><Search size={18} aria-hidden="true" /></button>
    </form>
    <button type="button" aria-label="필터 초기화" title="필터 초기화" onClick={() => onChange({ aio: "", youtube: "", q: "", page: "1" })} className="rounded-md p-2.5 text-neutral-500 hover:bg-neutral-100"><RotateCcw size={18} aria-hidden="true" /></button>
    </div>
  </div>;
}
