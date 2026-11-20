import type { CitationOverview } from "./citationMetrics";
import type { PromptSurface } from "./promptSurfaces";

export function citationStatus(row: CitationOverview["rows"][number], engine: PromptSurface) {
  if (row.measurable) return `${engine === "google-aio" ? "노출" : "측정 완료"}${row.latestAttemptFailed ? " · 최근 수집 실패" : ""}`;
  if (row.status === "uncollected") return "기간 내 미수집";
  if (row.status === "failed") return "수집 실패";
  if (row.answerPresent === false) return engine === "google-aio" ? "미노출" : "AI 답변 없음";
  if (row.webSearch === false) return "웹 검색 미사용";
  return "미측정";
}

export function citationPageSize(value: unknown) {
  const size = typeof value === "string" ? Number(value) : NaN;
  return [10, 25, 50].includes(size) ? size : 10;
}
