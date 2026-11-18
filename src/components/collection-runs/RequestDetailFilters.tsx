"use client";

import { Dropdown } from "@/components/ui/Dropdown";
import { filterValues, REQUEST_ITEM_STATUSES, REQUEST_ITEM_SURFACES, type RequestItemFacets } from "@/lib/requestItemFilters";
import { REQUEST_STATUS_LABEL, surfaceLabel } from "./RequestLogViews";

export function RequestDetailFilters({ query, facets, loading = false, onChange }: { query: string; facets?: RequestItemFacets; loading?: boolean; onChange: (changes: Record<string, string>) => void }) {
  const params = new URLSearchParams(query);
  return <div className="flex flex-wrap items-end gap-3" aria-label="수집 항목 필터">
    {([{ key: "status", label: "상태", values: REQUEST_ITEM_STATUSES, labelFor: (value: string) => REQUEST_STATUS_LABEL[value] },
      { key: "surface", label: "플랫폼", values: REQUEST_ITEM_SURFACES, labelFor: surfaceLabel }] as const).map(field => {
      const selected = filterValues(params, field.key);
      return <div key={field.key} className="relative flex flex-col gap-1.5"><span className="text-xs text-neutral-500">{field.label}</span>
        <details>
          <summary className="cursor-pointer list-none rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">{selected.length ? selected.map(field.labelFor).join(", ") : "전체"} ▾</summary>
          <div className="absolute left-0 z-30 mt-1 min-w-56 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-50" onClick={() => onChange({ [field.key]: "", page: "1" })}>전체</button>
            {field.values.map(value => {
              const checked = selected.includes(value), count = facets?.[field.key][value] ?? 0;
              const disabled = loading || (!!facets && count === 0 && !checked);
              return <label key={value} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-neutral-50"}`}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onChange({ [field.key]: (checked ? selected.filter(item => item !== value) : [...selected, value]).join(","), page: "1" })} />
                <span>{field.labelFor(value)}</span>{facets && <span className="ml-auto text-xs tabular-nums text-neutral-500">{count}</span>}
              </label>;
            })}
          </div>
        </details>
      </div>;
    })}
    <div className="flex flex-col gap-1.5"><span className="text-xs text-neutral-500">정렬</span><Dropdown variant="solid" label="" value={params.get("sort") === "newest" ? "최신순" : "오래된순"} options={["오래된순", "최신순"]} onChange={label => onChange({ sort: label === "최신순" ? "newest" : "oldest", page: "1" })} /></div>
  </div>;
}
