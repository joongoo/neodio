import { getCollectionActivityFlags } from "./collectionActivity";
import type { CollectionActivityStatus } from "@/lib/collectionActivityStatus";

export async function loadSidebarActivity(orgId: string, brandId: string | null, options: {
  read?: typeof getCollectionActivityFlags;
  logError?: (error: unknown) => void;
  timeoutMs?: number;
} = {}): Promise<CollectionActivityStatus> {
  if (!brandId) return { status: "ready", running: false, attention: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const flags = await Promise.race([
      (options.read ?? getCollectionActivityFlags)(orgId, brandId),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Sidebar collection activity timed out")), options.timeoutMs ?? 2000); }),
    ]);
    return { status: "ready", ...flags };
  } catch (error) {
    const log = options.logError ?? ((cause: unknown) => console.warn("[collection-sidebar] Status unavailable", {
      orgId, brandId, errorType: cause instanceof Error ? cause.name : "UnknownError",
      code: typeof cause === "object" && cause && "code" in cause ? cause.code : undefined,
    }));
    try { log(error); } catch { /* Logging failure must not break the app shell. */ }
    return { status: "unavailable" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
