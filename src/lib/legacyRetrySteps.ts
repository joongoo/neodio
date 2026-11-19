import type { CollectStep } from "./collectSteps";

export interface RetryLegacyItem { query: string; surface: string; device: string; promptId?: string | null }

/** One step per surface avoids retrying another engine's completed items. */
export function legacyRetrySteps(items: RetryLegacyItem[], requestId: string): CollectStep[] {
  const steps: CollectStep[] = [];
  for (const surface of ["naver-ai", "naver-aio", "google-ai-mode", "gemini", "google-aio"]) {
    const group = items.filter(item => item.surface === surface);
    if (!group.length) continue;
    const keywords = [...new Set(group.map(item => item.query))];
    if (surface === "google-aio") {
      steps.push({ kind: "aio", promptIds: [...new Set(group.map(item => item.promptId).filter((id): id is string => !!id))], devices: [...new Set(group.map(item => item.device))] as ("desktop" | "mobile")[], targets: group.filter(item => !!item.promptId).map(item => ({ promptId: item.promptId!, device: item.device as "desktop" | "mobile" })), requestId });
    } else if (surface === "gemini") steps.push({ kind: "gemini", keywords, requestId });
    else steps.push({ kind: "ai", engines: [surface === "naver-ai" ? "naver" : surface === "naver-aio" ? "naver-overview" : "google"], keywords, requestId });
  }
  return steps;
}
