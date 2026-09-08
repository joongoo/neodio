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
