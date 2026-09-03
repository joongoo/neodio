import { ReactNode } from "react";
import { Search, Settings } from "lucide-react";

// Matches Figma "Table Section" / "Panel - Brands" / "Panel - Source
// Domains" (Prompt Research results, node 646:12083 family) — a reusable
// header (title + description + search count) wrapping any table body.
// Generic on purpose: every future table-heavy screen can reuse this
// instead of hand-rolling the header chrome again.
export function TablePanel({
  title,
  description,
  count,
  total,
  onConfigureColumns,
  children,
}: {
  title: string;
  description: string;
  count: number;
  total: number;
  /** Shows the "컬럼 설정" gear button when provided (see ConfigureColumnsModal). */
  onConfigureColumns?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="w-full rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-bold text-neutral-900">{title}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {onConfigureColumns && (
            <button
              type="button"
              aria-label="컬럼 설정"
              onClick={onConfigureColumns}
              className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
            >
              <Settings size={16} />
            </button>
          )}
          <div className="flex h-9 w-[280px] items-center justify-between gap-2 rounded-full border border-neutral-300 px-3 py-2">
            <Search size={16} className="shrink-0 text-neutral-400" />
            <span className="text-[13px] text-neutral-500">
              {count}/{total}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
