import { createHash } from "node:crypto";
import { send } from "@vercel/queue";
import type { GeminiQueueScope } from "./geminiQueue";

export const GEMINI_QUEUE_TOPIC = "gemini-collection";
export function isGeminiQueueScope(value: unknown): value is GeminiQueueScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<GeminiQueueScope>;
  return [scope.organizationId, scope.brandId, scope.clientRequestId].every(s => typeof s === "string" && s.length > 0 && s.length <= 200);
}
export async function publishGemini(scope: GeminiQueueScope, wakeId = "initial") {
  const key = createHash("sha256").update(JSON.stringify([scope, wakeId])).digest("hex");
  await send(GEMINI_QUEUE_TOPIC, scope, { idempotencyKey: `gemini:${key}`, retentionSeconds: 86_400 });
}
