"use client";

import { Fragment, ReactNode, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  /** Tailwind width class, e.g. "w-[260px]". Defaults to flex-1. */
  width?: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** When given, each row becomes expandable and shows this under it. */
  renderExpanded?: (row: T) => ReactNode;
}

// Generic table shell matching Figma's "Table Row" / "Table Row Detail"
// (node 646:11718, Korean page: topic table). Reuse this for every future
// table page — only the `columns` + `renderExpanded` change per page, the
// row/expand/header chrome stays identical everywhere.
export function DataTable<T>({ columns, rows, getRowId, renderExpanded }: DataTableProps<T>) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-neutral-200">
      <div className="min-w-[720px]">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3">
          {columns.map((col) => (
            <div
              key={col.key}
              className={cn(
                "text-xs font-semibold text-neutral-500",
                col.width ? `${col.width} shrink-0` : "flex-1",
                col.align === "right" && "text-right"
              )}
            >
              {col.label}
            </div>
          ))}
        </div>

        {rows.map((row) => {
          const id = getRowId(row);
          const isOpen = expanded.has(id);
          return (
            <Fragment key={id}>
              <div
                className={cn(
                  "flex items-center gap-2 border-b border-neutral-100 px-5 py-3",
                  renderExpanded && "cursor-pointer hover:bg-neutral-50"
                )}
                onClick={renderExpanded ? () => toggle(id) : undefined}
              >
                {columns.map((col, i) => (
                  <div
                    key={col.key}
                    className={cn(
                      "flex items-center gap-2 text-xs text-neutral-700",
                      col.width ? `${col.width} shrink-0` : "flex-1",
                      col.align === "right" && "justify-end"
                    )}
                  >
                    {i === 0 &&
                      renderExpanded &&
                      (isOpen ? (
                        <ChevronDown size={14} className="shrink-0 text-neutral-400" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-neutral-400" />
                      ))}
                    {col.render(row)}
                  </div>
                ))}
              </div>
              {renderExpanded && isOpen && (
                <div className="border-b border-neutral-100 bg-neutral-100 px-6 py-3">
                  <div className="rounded-md border border-neutral-200 bg-white p-4">
                    {renderExpanded(row)}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
