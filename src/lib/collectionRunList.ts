import type { CollectedRunFile } from "@/lib/backend/collectionRunsTypes";
import { isBotBlocked } from "@/lib/backend/collectionRunsTypes";

// 수집 로그 화면용 가벼운 행 — 답변 원문·인용 목록은 빼고 표시에 필요한 값만 담는다.
// 원문(수백 KB~수 MB)은 행을 펼칠 때 따로 불러온다. 서버·클라이언트 양쪽에서 쓰는 순수 모듈.

export interface RunListRow {
  /** dir/filename — 행 식별자이자 분류·상세 조회 키. */
  key: string;
  dir: string;
  filename: string;
  runAt: string;
  source: string;
  collectedBy?: string;
  query: string;
  category?: string;
  topic?: string;
  answerLength: number;
  citationCount: number;
  state: "success" | "blocked" | "failed";
}

const ENGINE_LABEL: Record<string, string> = {
  "naver-ai-search": "네이버 AI검색",
  "naver-overview": "네이버 AI 브리핑",
  "google-ai-overview": "Google AI 모드",
  "google-aio": "구글AIO",
};

// API로 수집한 실행(source "api")은 collectedBy(`<provider>-api`)로 어떤 LLM인지 구분한다.
// 새 LLM을 붙이면(src/lib/backend/llm/registry.ts) 여기 한 줄 추가.
const API_ENGINE_LABEL: Record<string, string> = {
  "gemini-api": "Gemini",
};

export function engineLabel({ source, collectedBy }: { source: string; collectedBy?: string }) {
  if (source === "api") return API_ENGINE_LABEL[collectedBy ?? ""] ?? "API";
  return ENGINE_LABEL[source] ?? source;
}

export function toRunListRow(file: CollectedRunFile): RunListRow {
  const { promptRun: run } = file;
  const meta = run.rawMetadata;
  return {
    key: `${file.dir}/${file.filename}`,
    dir: file.dir,
    filename: file.filename,
    runAt: run.runAt,
    source: meta.source,
    collectedBy: meta.collectedBy,
    query: meta.query ?? "",
    category: meta.category,
    topic: meta.topic,
    answerLength: meta.answerTextLength ?? run.rawResponse.length,
    citationCount: meta.citations?.length ?? 0,
    state: isBotBlocked(run) ? "blocked" : run.status === "success" ? "success" : "failed",
  };
}

export function matchesRunSearch(row: RunListRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    row.query.toLowerCase().includes(q) ||
    engineLabel(row).toLowerCase().includes(q) ||
    (row.category ?? "").toLowerCase().includes(q) ||
    (row.topic ?? "").toLowerCase().includes(q)
  );
}

export const RUN_PAGE_SIZES = [10, 25, 50];
export const DEFAULT_RUN_PAGE_SIZE = 25;

export interface RunListPage {
  rows: RunListRow[];
  /** 검색 조건에 맞는 전체 행 수. */
  filteredTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** 검색 → 페이지 자르기. 요청한 페이지가 범위를 벗어나면 가까운 페이지로 맞춘다. */
export function pageRunList(rows: RunListRow[], opts: { search?: string; page?: number; pageSize?: number }): RunListPage {
  const pageSize = RUN_PAGE_SIZES.includes(opts.pageSize ?? 0) ? (opts.pageSize as number) : DEFAULT_RUN_PAGE_SIZE;
  const filtered = opts.search?.trim() ? rows.filter((row) => matchesRunSearch(row, opts.search!)) : rows;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pageCount);
  return { rows: filtered.slice((page - 1) * pageSize, page * pageSize), filteredTotal: filtered.length, page, pageSize, pageCount };
}
