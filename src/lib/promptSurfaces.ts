// 수집 표면(surface) — 프롬프트(질의)는 한 곳에서만 등록하고, "어디에서 수집할지"는 표면 설정이다.
//   · google-aio      Google 검색의 AI Overview (디바이스별, 문단·영상 인용 구간 기록) — YouTube AIO 트래커
//   · google-ai-mode  Google AI 모드(udm=50, 대화형 답변)
//   · naver-ai        네이버 AI 브리핑
// 결과 테이블은 표면 성격에 맞게 따로 두고(aio_observations / prompt_runs), 프롬프트 기준으로 합쳐 읽는다.
// 클라이언트와 서버가 같이 쓰므로 Node 모듈을 가져오지 않는다.
export const PROMPT_SURFACES = ["google-aio", "google-ai-mode", "naver-ai"] as const;
export type PromptSurface = (typeof PROMPT_SURFACES)[number];

export const SURFACE_LABEL: Record<PromptSurface, string> = {
  "google-aio": "Google AI Overview",
  "google-ai-mode": "Google AI 모드",
  "naver-ai": "네이버 AI 브리핑",
};

/** 지금까지 프롬프트 라이브러리가 수집하던 표면 — 기존 추적 프롬프트의 기본값. */
export const AI_ANSWER_SURFACES: PromptSurface[] = ["naver-ai", "google-ai-mode"];

export function isPromptSurface(value: unknown): value is PromptSurface {
  return typeof value === "string" && (PROMPT_SURFACES as readonly string[]).includes(value);
}

/** 알 수 없는 값은 버리고, 중복을 없애고, 정해진 순서로 돌려준다. */
export function normalizeSurfaces(input: unknown): PromptSurface[] {
  const given = new Set(Array.isArray(input) ? input.filter(isPromptSurface) : []);
  return PROMPT_SURFACES.filter((surface) => given.has(surface));
}

/**
 * 프롬프트 문장으로 기본 표면을 제안한다 — 짧은 검색어형은 AIO, 완전한 질문형은 AI 답변 표면.
 * AIO는 검색 1건이 느리고 하루 상한(캡차)이 있어서 검색어형에만 기본으로 켠다. 사용자가 언제든 바꿀 수 있다.
 */
export function suggestSurfaces(text: string): PromptSurface[] {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const questionLike = /[?？]/.test(t) || /(요|까|죠|나요|가요|니까|세요)[\s.!]*$/.test(t) || words >= 6;
  return questionLike ? [...AI_ANSWER_SURFACES] : ["google-aio"];
}
