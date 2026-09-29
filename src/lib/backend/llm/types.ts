import type { RawCitationMetadata } from "@/lib/db/types";

// LLM API 수집의 공통 계약 — 새 모델은 LlmProvider 하나만 구현해 registry.ts에 등록하면
// 실행기(runner.ts)와 CLI(scripts/collect-llm.ts)가 그대로 돌린다.

export interface LlmAnswer {
  /** 답변 본문 */
  text: string;
  /** 답변이 근거로 든 출처(웹 검색 근거 사용 시) */
  citations: RawCitationMetadata[];
  /** 실제로 호출한 모델 이름 */
  model: string;
  /** 제공사 원본에서 보존할 값(검색어, 토큰 수 등) — rawMetadata.providerData로 저장된다 */
  providerData?: Record<string, unknown>;
}

export interface LlmAskOptions {
  apiKey: string;
  /** 없으면 제공사 기본 모델 */
  model?: string;
  /** false면 웹 검색 근거 없이 모델 지식만으로 답한다(기본 true — 인용률 측정에 필요) */
  webSearch?: boolean;
  /** 답변 언어·지역 힌트(BCP 47, 예: ko-KR) */
  locale?: string;
  signal?: AbortSignal;
}

export interface LlmProvider {
  /** CLI --provider 값 */
  id: string;
  /** seed의 llm_models.id — 수집 결과가 붙는 모델 */
  llmModelId: string;
  /** API 키를 읽는 환경변수 이름(키체인 서비스 이름도 같다) */
  apiKeyEnv: string;
  /** 모델 환경변수(없으면 defaultModel) */
  modelEnv: string;
  defaultModel: string;
  ask(query: string, options: LlmAskOptions): Promise<LlmAnswer>;
}

/** 호출 실패 — 재시도할 만한지(rate limit·일시 오류)를 실행기가 판단한다. */
export class LlmRequestError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
  }
}
