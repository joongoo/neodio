import { PromptRunSeed } from "@/lib/db/types";

// Client-safe (no node:fs) — split out of collectionRuns.ts so the client
// component can import isBotBlocked without pulling fs into the browser bundle.
export interface CollectedRunFile {
  filename: string;
  dir: string;
  promptRun: PromptRunSeed;
}

// Google blocks the headless collector with a captcha wall on this account/IP
// combination — the run reports status "success" (the page rendered) even
// though no real AI Overview text came back, so this catches it separately.
export function isBotBlocked(run: PromptRunSeed): boolean {
  return (
    run.rawMetadata.source === "google-ai-overview" &&
    (run.rawMetadata.finalUrl?.includes("/sorry/") || run.rawResponse.includes("보안문자"))
  );
}

// 이 run이 "측정 가능한 신호"인지 판정한다 — VIVI 등 GEO 제품의 AI
// Existence 개념과 동일: 우리 브랜드가 언급됐는지와는 별개로, 애초에 AI가
// 그 질문에 답변 블록을 만들었는지를 본다. 네이버/구글 수집 스크립트는
// AI가 답을 안 만든 경우(rawResponse가 너무 짧음)를 errorMessage
// "empty_ai_mode_answer"/"empty_ai_briefing"로 구분해 이미 저장해두고
// 있었다 — status만 "failed"로 뭉뚱그려져서 지금까진 활용하지 않았다.
//
// - "ai-answered": 실제 브랜드 언급/인용 분석 대상 (기존 status
//   "success"와 동일).
// - "ai-absent": 수집 자체는 정상 완료됐지만 AI가 그 질문에 답변을
//   만들지 않음 — 콘텐츠 문제가 아니라 엔진 특성/질문 특성. "측정은
//   됐지만 언급 기회 자체가 없었다"는 유효한 데이터 포인트.
// - "collection-error": 봇 차단, 네트워크 오류 등 진짜 수집 실패 — AI가
//   답을 했는지조차 알 수 없어 분모에서 제외해야 한다.
export type RunOutcome = "ai-answered" | "ai-absent" | "collection-error";

export function getRunOutcome(run: PromptRunSeed): RunOutcome {
  if (run.status === "success") return "ai-answered";
  const message = run.rawMetadata.errorMessage ?? "";
  if (message.startsWith("empty_ai_mode_answer") || message.startsWith("empty_ai_briefing")) return "ai-absent";
  return "collection-error";
}

// Collector scripts store runAt as a UTC ISO string — this page always
// displays it in KST, formatted the same way regardless of viewer timezone.
export function formatKst(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
