import { getPromptStore } from "./database";

export async function getLlmBridgeScope<T>(orgId: string, scope: string): Promise<Record<string, T>> {
  return (await getPromptStore()).bridgeScope<T>(orgId, scope);
}

export async function getLlmBridgeEntry<T>(orgId: string, scope: string, key: string): Promise<T | null> {
  return (await getLlmBridgeScope<T>(orgId, scope))[key] ?? null;
}

export async function setLlmBridgeEntry<T>(orgId: string, scope: string, key: string, data: T): Promise<void> {
  (await getPromptStore()).putBridge(orgId, scope, { [key]: data });
}

export async function setLlmBridgeEntries<T>(orgId: string, scope: string, entries: Record<string, T>): Promise<void> {
  (await getPromptStore()).putBridge(orgId, scope, entries);
}
