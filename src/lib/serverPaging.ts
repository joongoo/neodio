// 서버에서 표 한 페이지만 잘라 보내기 위한 순수 함수 — 행이 수천 개가 돼도 브라우저로 가는 양이 일정하다.
// 페이지 번호·크기·검색어는 주소(쿼리)에 두고, 표마다 접두사(own/tp/dom)로 구분한다.

export const TABLE_PAGE_SIZES = [10, 25, 50];
export const DEFAULT_TABLE_PAGE_SIZE = 10;

export interface TablePage<T> {
  rows: T[];
  /** 검색까지 적용한 전체 행 수. */
  filteredTotal: number;
  /** 검색 전(필터만 적용한) 전체 행 수. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  search: string;
}

export interface TableQuery {
  page?: string;
  size?: string;
  q?: string;
}

/** 표 하나의 쿼리(page/size/q)를 주소 파라미터에서 꺼낸다 — 접두사가 "own"이면 ownPage/ownSize/ownQ. */
export function tableQueryFrom(params: Record<string, string | undefined>, prefix: string): TableQuery {
  return { page: params[`${prefix}Page`], size: params[`${prefix}Size`], q: params[`${prefix}Q`] };
}

/** 필터를 적용한 행(base)에서 검색 → 페이지 자르기. 범위를 벗어난 페이지는 가까운 페이지로 맞춘다. */
export function pageTable<T>(base: T[], query: TableQuery, matches: (row: T, search: string) => boolean): TablePage<T> {
  const search = (query.q ?? "").trim();
  const sizeRequested = Number(query.size);
  const pageSize = TABLE_PAGE_SIZES.includes(sizeRequested) ? sizeRequested : DEFAULT_TABLE_PAGE_SIZE;
  const filtered = search ? base.filter((row) => matches(row, search.toLowerCase())) : base;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(Number(query.page)) || 1), pageCount);
  return {
    rows: filtered.slice((page - 1) * pageSize, page * pageSize),
    filteredTotal: filtered.length,
    total: base.length,
    page,
    pageSize,
    pageCount,
    search,
  };
}
