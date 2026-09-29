import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { PromptStore } from "../database/store";
import type { PromptRunSeed } from "@/lib/db/types";
import { LlmRequestError, type LlmProvider } from "./types";

// 어떤 LlmProvider든 같은 방식으로: 질문 → 답변 → PromptRunSeed → DB(prompt_runs).
// 사용자 PC나 Chrome이 필요 없어 서버(Vercel 포함)에서도 그대로 돌 수 있다.

export interface RunLlmOptions {
  store: PromptStore;
  orgId: string;
  provider: LlmProvider;
  query: string;
  apiKey: string;
  model?: string;
  webSearch?: boolean;
  marketId?: string;
  locale?: string;
  /** 일시 오류(429/5xx) 재시도 횟수 */
  retries?: number;
  now?: () => Date;
}

export interface RunLlmResult {
  runId: string;
  status: "success" | "failed";
  citations: number;
  errorMessage: string | null;
}

/** 환경변수, 없으면 macOS 키체인(scripts/secret.sh set <이름>)에서 API 키를 읽는다. */
export function resolveApiKey(name: string): string {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "darwin") {
    const result = spawnSync("security", ["find-generic-password", "-a", process.env.USER ?? "", "-s", name, "-w"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error(`${name}가 없습니다. 환경변수로 넣거나 \`scripts/secret.sh set ${name}\`으로 키체인에 저장하세요.`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runLlmQuery(options: RunLlmOptions): Promise<RunLlmResult> {
  const { store, orgId, provider, query, apiKey, retries = 2 } = options;
  const runAt = (options.now?.() ?? new Date()).toISOString();
  const runId = `run-${provider.id}-${runAt.replace(/\D/g, "")}-${createHash("sha1").update(`${orgId}\n${query}`).digest("hex").slice(0, 8)}`;
  const model = options.model ?? process.env[provider.modelEnv] ?? provider.defaultModel;

  let answer: Awaited<ReturnType<LlmProvider["ask"]>> | null = null;
  let errorMessage: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      answer = await provider.ask(query, { apiKey, model, webSearch: options.webSearch, locale: options.locale });
      if (!answer.text) throw new LlmRequestError("빈 답변");
      errorMessage = null;
      break;
    } catch (error) {
      answer = null;
      errorMessage = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof LlmRequestError && error.retryable;
      if (!retryable || attempt === retries) break;
      await sleep(2_000 * 2 ** attempt);
    }
  }

  const promptRun: PromptRunSeed = {
    id: runId,
    promptId: "manual",
    llmModelId: provider.llmModelId,
    marketId: options.marketId ?? "market-kr",
    runAt,
    status: answer ? "success" : "failed",
    rawResponse: answer?.text ?? "",
    rawMetadata: {
      source: "api",
      collectedBy: `${provider.id}-api`,
      query,
      locale: options.locale,
      answerTextLength: answer?.text.length ?? 0,
      citations: answer?.citations ?? [],
      errorMessage,
      model: answer?.model ?? model,
      providerData: answer?.providerData,
    },
  };
  await store.importRun(orgId, { dir: `.tmp/${provider.id}-api`, filename: `${runId}.json`, promptRun });
  return { runId, status: promptRun.status === "success" ? "success" : "failed", citations: answer?.citations.length ?? 0, errorMessage };
}
