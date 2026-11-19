"use client";

import { useEffect, useRef, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Check, ChevronDown } from "lucide-react";
import { filterValues, REQUEST_ITEM_STATUSES, REQUEST_ITEM_SURFACES, type RequestItemFacets } from "@/lib/requestItemFilters";
import { REQUEST_STATUS_LABEL, surfaceLabel } from "./RequestLogViews";

export function RequestDetailFilters({ query, facets, loading = false, onChange, mode = "items" }: { query: string; facets?: RequestItemFacets; loading?: boolean; mode?: "items" | "requests"; onChange: (changes: Record<string, string>) => void }) {
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
  return <div ref={root} className="flex flex-wrap items-end gap-3" aria-label="수집 항목 필터">
    {([{ key: "status", label: "상태", values: mode === "requests" ? ["queued", "running", "completed", "partially_failed", "cancelled"] : REQUEST_ITEM_STATUSES.filter(value => value !== "submitting" && value !== "queued"), labelFor: (value: string) => mode === "items" && ["reserved", "submitting"].includes(value) ? "수집 대기 / 제출 중" : mode === "items" && ["queued", "collecting"].includes(value) ? "수집 중" : REQUEST_STATUS_LABEL[value] },
      { key: "surface", label: "플랫폼", values: REQUEST_ITEM_SURFACES, labelFor: surfaceLabel }] as const).map(field => {
      const selected = filterValues(params, field.key);
      return <div key={field.key} className="relative flex flex-col gap-1.5" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(current => current === field.key ? null : current); }}
        onKeyDown={event => { if (event.key === "Escape") { setOpen(null); event.currentTarget.querySelector("button")?.focus(); } }}><span className="text-xs text-neutral-500">{field.label}</span>
          <button type="button" aria-expanded={open === field.key} onClick={() => setOpen(current => current === field.key ? null : field.key)} className="inline-flex cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-md bg-slate-800 px-3.5 py-2 text-sm text-white"><span>{selected.length ? [...new Set(selected.map(field.labelFor))].join(", ") : "전체"}</span><ChevronDown size={16} className="shrink-0 text-white" aria-hidden="true" /></button>
          <div hidden={open !== field.key} className="absolute left-0 top-full z-30 mt-1 min-w-56 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-50" onClick={() => onChange({ [field.key]: "", page: "1" })}>전체</button>
            {field.values.map(value => {
              const group = mode === "items" && field.key === "status" && value === "reserved" ? ["reserved", "submitting"] : mode === "items" && field.key === "status" && value === "collecting" ? ["queued", "collecting"] : [value];
              const checked = group.some(item => selected.includes(item)), count = group.reduce((total, item) => total + (facets?.[field.key][item] ?? 0), 0);
              const empty = !!facets && count === 0 && !checked;
              const disabled = loading || empty;
              return <button type="button" role="checkbox" aria-checked={checked} aria-disabled={disabled} disabled={empty} key={value}
                onClick={() => { if (!disabled) onChange({ [field.key]: (checked ? selected.filter(item => !group.includes(item)) : [...selected, ...group]).join(","), page: "1" }); }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-neutral-50"}`}>
                <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-400 bg-white"}`}>{checked && <Check size={12} />}</span>
                <span>{field.labelFor(value)}</span>{facets && <span className="ml-auto text-xs tabular-nums text-neutral-500">{count}</span>}
              </button>;
            })}
          </div>
      </div>;
    })}
    <div className="flex flex-col gap-1.5" onFocus={() => setOpen(null)} onPointerDown={() => setOpen(null)}><span className="text-xs text-neutral-500">정렬</span><Dropdown variant="solid" label="" value={(params.get("sort") ?? (mode === "requests" ? "newest" : "oldest")) === "newest" ? "최신순" : "오래된순"} options={["오래된순", "최신순"]} onChange={label => onChange({ sort: label === "최신순" ? "newest" : "oldest", page: "1" })} /></div>
  </div>;
}
