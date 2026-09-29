import { useMemo, useState } from "react";

/** 표 아래 Pagination과 짝으로 쓰는 클라이언트 페이지 나누기. 행 수가 줄어 현재 페이지가 없어지면 마지막 페이지로 맞춘다. */
export function usePagedRows<T>(rows: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [rows, clampedPage, pageSize]
  );
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };
  return { page: clampedPage, setPage, pageCount, pageRows, pageSize, setPageSize: changePageSize };
}
