import type { PromptLibraryRow } from "@/lib/db/types";
import { getPromptStore } from "./database";
import type { PromptInput } from "./database/store";
import type { PromptSurface } from "@/lib/promptSurfaces";

// 프롬프트 추적은 조직의 자사 브랜드(헤더 선택, tenant.ts) 단위다 — 예전엔
// brand-neodigm 고정이었다. brandId는 호출하는 페이지/API가 넘긴다.
export async function saveLibraryRow(orgId: string, brandId: string, row: Omit<PromptLibraryRow, "id">, source: Partial<PromptInput> = {}, options: { surfaces?: PromptSurface[] } = {}): Promise<PromptLibraryRow> {
  if (!brandId) throw new Error("브랜드를 먼저 등록하세요 — 프롬프트는 조직의 브랜드 단위로 추적됩니다.");
  const store = await getPromptStore();
  return store.track(orgId, { ...source, text: row.prompt, category: row.category, topic: row.topic,
    sourceType: source.sourceType ?? row.origin }, { brandId, origin: row.origin, surfaces: options.surfaces });
}

export async function trackTopic(orgId: string, brandId: string, promptText: string, category: string,
  options: { topic?: string; source: string; intent?: string; reasoning?: string; purpose?: string } = { source: "tracking" }): Promise<PromptLibraryRow> {
  return saveLibraryRow(orgId, brandId, { prompt: promptText, origin: "ai_generated", category, topic: options.topic ?? "—",
    lastModifiedAt: null, lastModifiedBy: null }, { sourceType: options.source, searchIntent: options.intent,
    generationReasoning: options.reasoning, generationPurpose: options.purpose });
}

export async function listPromptLibrary(orgId: string, brandId: string): Promise<PromptLibraryRow[]> {
  if (!brandId) return [];
  return (await getPromptStore()).library(orgId, brandId);
}

// Compatibility partitions for existing pages; both read the same canonical table.
export async function listTrackedTopics(orgId: string, brandId: string): Promise<PromptLibraryRow[]> {
  return (await listPromptLibrary(orgId, brandId)).filter(row => !row.id.startsWith("pl-"));
}

export async function listSeedLibraryRows(orgId: string, brandId: string): Promise<PromptLibraryRow[]> {
  return (await listPromptLibrary(orgId, brandId)).filter(row => row.id.startsWith("pl-"));
}

export async function updateLibraryRow(orgId: string, rowId: string, patch: Pick<PromptLibraryRow, "prompt" | "category" | "topic">) {
  return (await getPromptStore()).updateLibrary(orgId, rowId, patch);
}

export async function deleteTrackedTopic(orgId: string, rowId: string) {
  return (await getPromptStore()).setTrackingStatus(orgId, rowId, "archived");
}

export async function updateLibraryRowsByPrompt(orgId: string, prompt: string, patch: Partial<Pick<PromptLibraryRow, "topic" | "category">>) {
  const store = await getPromptStore();
  const promptId = await store.upsertPrompt(orgId, { text: prompt });
  const existing = (await store.getPrompt(orgId, promptId))!;
  await store.upsertPrompt(orgId, { text: prompt, topic: patch.topic ?? existing.topic ?? undefined,
    category: patch.category ?? existing.category ?? undefined }, true);
}
