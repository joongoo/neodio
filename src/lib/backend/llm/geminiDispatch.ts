import { after } from "next/server";
import { setTimeout as delay } from "node:timers/promises";
import { runGeminiBatch, type GeminiQueueScope } from "./geminiQueue";
import { publishGemini } from "./geminiQueueWake";

export async function dispatchGemini(scope: GeminiQueueScope, wakeId?: string) {
  if (process.env.VERCEL) return publishGemini(scope, wakeId);
  after(async () => {
    while (true) {
      const batch = await runGeminiBatch(scope);
      if (!batch.pending) return;
      await delay(batch.processed ? 100 : 5_000);
    }
  });
}
