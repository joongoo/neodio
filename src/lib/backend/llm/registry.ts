import { geminiProvider } from "./providers/gemini";
import type { LlmProvider } from "./types";

// 새 LLM 붙이기: providers/<이름>.ts에 LlmProvider를 구현하고 여기 한 줄 추가.
// (seed의 llm_models에 같은 llmModelId가 있어야 결과가 그 모델로 집계된다.)
export const LLM_PROVIDERS: Record<string, LlmProvider> = {
  [geminiProvider.id]: geminiProvider,
};

export function getLlmProvider(id: string): LlmProvider {
  const provider = LLM_PROVIDERS[id];
  if (!provider) throw new Error(`알 수 없는 LLM: ${id} (${Object.keys(LLM_PROVIDERS).join(" | ")})`);
  return provider;
}
