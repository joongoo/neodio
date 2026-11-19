import type { AioKeywordRow } from "./db/types";
import { pageTable } from "./serverPaging";

export const AIO_FILTER_OPTIONS = [
  { key: "aio", label: "AIO 노출 여부", options: [{ value: "aio_present", label: "노출" }, { value: "aio_absent", label: "미노출" }, { value: "unmeasured", label: "미측정" }] },
  { key: "youtube", label: "YouTube 인용 유형", options: [{ value: "own", label: "우리 채널" }, { value: "other", label: "타 채널" }, { value: "none", label: "없음" }] },
] as const;

export function aioFilterValues(params: URLSearchParams, key: string): string[] {
  const field = AIO_FILTER_OPTIONS.find(field => field.key === key);
  return [...new Set((params.get(key) ?? "").split(",").filter(value => field?.options.some(option => option.value === value)))];
}

/** Filters apply to each prompt's latest snapshot in the selected overview period. */
export function aioPromptTable(rows: AioKeywordRow[], params: URLSearchParams) {
  const aio = aioFilterValues(params, "aio");
  const youtube = aioFilterValues(params, "youtube");
  const filtered = rows.filter(row => {
    if (aio.length && !aio.includes(row.status)) return false;
    if (youtube.length && !youtube.some(type =>
      type === "own" ? row.youtubeVideos.some(video => video.own) :
      type === "other" ? row.youtubeVideos.some(video => !video.own) :
      row.status !== "unmeasured" && row.youtubeVideos.length === 0
    )) return false;
    return true;
  });
  return pageTable(filtered, { page: params.get("page") ?? undefined, size: params.get("size") ?? undefined, q: params.get("q") ?? undefined }, (row, search) => row.keyword.toLowerCase().includes(search));
}

export type AioPromptFacets = Record<"aio" | "youtube", Record<string, number>>;

/** Count each option using the search and the other field, independently of pagination. */
export function aioPromptFacets(rows: AioKeywordRow[], params: URLSearchParams): AioPromptFacets {
  const facets: AioPromptFacets = { aio: {}, youtube: {} };
  for (const field of AIO_FILTER_OPTIONS) {
    for (const option of field.options) {
      const candidate = new URLSearchParams(params);
      candidate.set(field.key, option.value);
      facets[field.key][option.value] = aioPromptTable(rows, candidate).filteredTotal;
    }
  }
  return facets;
}
