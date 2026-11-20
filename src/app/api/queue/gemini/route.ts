import { handleCallback } from "@vercel/queue";
import { runGeminiBatch } from "@/lib/backend/llm/geminiQueue";
import { isGeminiQueueScope } from "@/lib/backend/llm/geminiQueueWake";

export const runtime = "nodejs";
export const maxDuration = 180;
export const POST = handleCallback(async (message: unknown) => {
  if (!isGeminiQueueScope(message)) return;
  const result = await runGeminiBatch(message);
  // Redelivery drains the persisted request, never repeats submitted items.
  if (result.pending) throw new Error("Gemini 요청의 대기 작업을 이어서 처리합니다.");
}, { retry: () => ({ afterSeconds: 5 }) });
