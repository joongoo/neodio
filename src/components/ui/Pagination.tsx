"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

// Matches Figma "Pagination Footer" (node 646:11731). Reuse this under any
// DataTable so pagination looks/behaves the same on every page.
export function Pagination({
  page,
  pageCount,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: PaginationProps) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-500">페이지당 항목 수:</span>
      <Dropdown
        label=""
        value={String(pageSize)}
        options={pageSizeOptions.map(String)}
        onChange={(v) => onPageSizeChange?.(Number(v))}
        className="scale-90"
      />
      <div className="flex-1" />
      <span className="text-xs text-neutral-500">
        {start}-{end} of {totalCount}
      </span>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="이전 페이지"
        className="grid size-6 place-items-center rounded-md bg-slate-100 text-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="whitespace-nowrap text-xs text-neutral-500">
        {pageCount}페이지 중 {page}페이지
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        aria-label="다음 페이지"
        className="grid size-6 place-items-center rounded-md bg-slate-100 text-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
