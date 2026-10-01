import { AI_ANSWER_SURFACES, PROMPT_SURFACES, type PromptSurface } from "@/lib/promptSurfaces";

// 프롬프트 라이브러리의 "선택 수집" — 고른 프롬프트를 저장된 플랫폼대로 나눠 수집 단계로 만든다.
// 플랫폼마다 수집 방식이 달라서(네이버·Google AI 모드는 답변 수집, AIO는 검색 결과 수집) 단계가 나뉘고,
// 답변 수집은 프롬프트별로 켜진 엔진 조합이 같은 것끼리 묶는다 — 네이버만 켠 프롬프트가 구글로도 수집되지 않게.

export type CollectEngine = "naver" | "naver-overview" | "google";

export type CollectStep =
  | { kind: "ai"; engines: CollectEngine[]; keywords: string[] }
  | { kind: "aio"; promptIds: string[] }
  | { kind: "gemini"; keywords: string[] };

export interface CollectRow {
  prompt: string;
  promptId?: string;
  /** 저장된 플랫폼 — 없으면(플랫폼 정보가 없는 행) 기존 라이브러리 기본값으로 본다. */
  surfaces?: PromptSurface[];
}

export const surfacesOf = (row: CollectRow): PromptSurface[] => (row.surfaces && row.surfaces.length > 0 ? row.surfaces : [...AI_ANSWER_SURFACES]);

/** 플랫폼마다 고른 프롬프트가 몇 개인지 — 수집 창의 플랫폼별 개수. */
export function countBySurface(rows: CollectRow[]): Record<PromptSurface, number> {
  return Object.fromEntries(PROMPT_SURFACES.map((surface) => [surface, rows.filter((row) => surfacesOf(row).includes(surface)).length])) as Record<PromptSurface, number>;
}

/** 체크한 플랫폼만 수집하는 단계 목록. 네이버·Google 레인은 서로 막히지 않게 단계를 따로 두고, 모든 단계는 동시에 시작한다. */
export function buildCollectSteps(rows: CollectRow[], enabled: ReadonlySet<PromptSurface>): CollectStep[] {
  const groups = new Map<string, { engines: CollectEngine[]; keywords: string[] }>();
  const add = (engines: CollectEngine[], keyword: string) => {
    if (engines.length === 0) return;
    const key = engines.join("+");
    const group = groups.get(key) ?? { engines, keywords: [] };
    group.keywords.push(keyword);
    groups.set(key, group);
  };
  for (const row of rows) {
    const surfaces = surfacesOf(row);
    const naver: CollectEngine[] = [];
    if (enabled.has("naver-aio") && surfaces.includes("naver-aio")) naver.push("naver-overview");
    if (enabled.has("naver-ai") && surfaces.includes("naver-ai")) naver.push("naver");
    add(naver, row.prompt);
    if (enabled.has("google-ai-mode") && surfaces.includes("google-ai-mode")) add(["google"], row.prompt);
  }
  const steps: CollectStep[] = [...groups.values()].map((group) => ({ kind: "ai" as const, ...group }));
  const promptIds = enabled.has("google-aio") ? rows.filter((row) => row.promptId && surfacesOf(row).includes("google-aio")).map((row) => row.promptId as string) : [];
  if (promptIds.length > 0) steps.push({ kind: "aio", promptIds });
  const geminiKeywords = enabled.has("gemini") ? rows.filter((row) => surfacesOf(row).includes("gemini")).map((row) => row.prompt) : [];
  if (geminiKeywords.length > 0) steps.push({ kind: "gemini", keywords: geminiKeywords });
  return steps;
}
