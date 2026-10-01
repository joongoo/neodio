// 플랫폼(surface) — 프롬프트(질의)는 한 곳에서만 등록하고, "어디에서 수집할지"는 플랫폼 설정이다.
//   · google-aio      Google 검색의 AI Overview (디바이스별, 문단·영상 인용 구간 기록) — YouTube AIO 트래커
//   · google-ai-mode  Google AI 모드(udm=50, 대화형 답변)
//   · naver-aio       네이버 통합검색 첫 화면의 AI 브리핑(오버뷰) — 사용자 PC의 수집기가 검색 결과에서 읽는다
//   · naver-ai        네이버 AI 검색(AI 탭)의 대화형 답변
//   · gemini          Gemini API 답변(웹 검색 근거 포함) — 서버가 공식 API로 바로 수집, 수집기 불필요
// 결과 테이블은 플랫폼 성격에 맞게 따로 두고(aio_observations / prompt_runs), 프롬프트 기준으로 합쳐 읽는다.
// 클라이언트와 서버가 같이 쓰므로 Node 모듈을 가져오지 않는다.
export const PROMPT_SURFACES = ["google-aio", "google-ai-mode", "naver-aio", "naver-ai", "gemini"] as const;
export type PromptSurface = (typeof PROMPT_SURFACES)[number];

export const SURFACE_LABEL: Record<PromptSurface, string> = {
  "google-aio": "구글AIO",
  "google-ai-mode": "구글AI",
  "naver-aio": "네이버AIO",
  "naver-ai": "네이버AI",
  gemini: "Gemini",
};

/** 지금까지 프롬프트 라이브러리가 수집하던 플랫폼 — 기존 추적 프롬프트의 기본값. */
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
 * 프롬프트 문장으로 기본 플랫폼을 제안한다 — 짧은 검색어형은 AIO, 완전한 질문형은 AI 답변 플랫폼.
 * AIO는 검색 1건이 느리고 하루 상한(캡차)이 있어서 검색어형에만 기본으로 켠다. 사용자가 언제든 바꿀 수 있다.
 */
export function suggestSurfaces(text: string): PromptSurface[] {
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  const questionLike = /[?？]/.test(t) || /(요|까|죠|나요|가요|니까|세요)[\s.!]*$/.test(t) || words >= 6;
  return questionLike ? [...AI_ANSWER_SURFACES] : ["google-aio"];
}

/** AIO는 검색 1건이 느리고 캡차 때문에 하루 수집 상한이 있다(현실적으로 150~250건). 화면이 이 값을 기준으로 경고한다. */
export const AIO_DAILY_CAP = 150;

/** 플랫폼 설정으로 본 하루 AIO 수집량 — AIO가 켜진 프롬프트 수 × 디바이스 수. */
export function aioDailyLoad(surfaceLists: (readonly PromptSurface[] | undefined)[], deviceCount: number) {
  const prompts = surfaceLists.filter((surfaces) => surfaces?.includes("google-aio")).length;
  const searches = prompts * Math.max(1, deviceCount);
  return { prompts, searches, cap: AIO_DAILY_CAP, over: searches > AIO_DAILY_CAP };
}
