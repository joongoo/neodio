import type { PromptLibraryRow } from "@/lib/db/types";
import { DEFAULT_TRACKING_BRAND, getPromptStore } from "./database";
import type { PromptInput } from "./database/store";

export async function saveLibraryRow(orgId: string, row: Omit<PromptLibraryRow, "id">, source: Partial<PromptInput> = {}): Promise<PromptLibraryRow> {
  const store = await getPromptStore();
  return store.track(orgId, { ...source, text: row.prompt, category: row.category, topic: row.topic,
    sourceType: source.sourceType ?? row.origin }, { brandId: DEFAULT_TRACKING_BRAND, origin: row.origin });
}

export async function trackTopic(orgId: string, promptText: string, category: string,
  options: { topic?: string; source: string; intent?: string; reasoning?: string; purpose?: string } = { source: "tracking" }): Promise<PromptLibraryRow> {
  return saveLibraryRow(orgId, { prompt: promptText, origin: "ai_generated", category, topic: options.topic ?? "—",
    lastModifiedAt: null, lastModifiedBy: null }, { sourceType: options.source, searchIntent: options.intent,
    generationReasoning: options.reasoning, generationPurpose: options.purpose });
}

export async function listPromptLibrary(orgId: string): Promise<PromptLibraryRow[]> {
  return (await getPromptStore()).library(orgId, DEFAULT_TRACKING_BRAND);
}

// Compatibility partitions for existing pages; both read the same canonical table.
export async function listTrackedTopics(orgId: string): Promise<PromptLibraryRow[]> {
  return (await listPromptLibrary(orgId)).filter(row => !row.id.startsWith("pl-"));
}

export async function listSeedLibraryRows(orgId: string): Promise<PromptLibraryRow[]> {
  return (await listPromptLibrary(orgId)).filter(row => row.id.startsWith("pl-"));
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
