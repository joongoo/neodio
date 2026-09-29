import type { LlmBrainstormCard } from "@/lib/db/types";

// "검색어 트렌드 분석"·"사이트맵 크롤 분석" 마법사의 공통 부분 — 종류별 설정, 프롬프트 만들기, LLM 답변 검증.
// 결과는 가상 사용자 질문(LlmBrainstormCard)과 같은 카드 모양이라 같은 화면·같은 저장 경로(llm-bridge)를 쓴다.

export type StrategyKind = "trend" | "sitemap";

export interface StrategyKindConfig {
  scope: "llm-trend-strategy" | "llm-sitemap-strategy";
  source: "search_trend" | "sitemap_crawl";
  idPrefix: string;
  title: string;
  description: string;
  digestLabel: string;
}

export const STRATEGY_KINDS: Record<StrategyKind, StrategyKindConfig> = {
  trend: {
    scope: "llm-trend-strategy",
    source: "search_trend",
    idPrefix: "trend",
    title: "검색어 트렌드 분석 등록",
    description: "네이버 검색 관심도 추세에서 지금 준비할 주제를 찾아 추천 카드와 질문을 만듭니다. 결과는 검증을 통과해야 저장됩니다.",
    digestLabel: "네이버 검색 관심도",
  },
  sitemap: {
    scope: "llm-sitemap-strategy",
    source: "sitemap_crawl",
    idPrefix: "sitemap",
    title: "사이트맵 크롤 분석 등록",
    description: "사이트맵 크롤 결과에서 AI 답변에 인용되기 어려운 영역과 강점을 찾아 추천 카드와 질문을 만듭니다. 결과는 검증을 통과해야 저장됩니다.",
    digestLabel: "사이트맵 크롤 결과",
  },
};

const CARD_FORMAT =
  '[{"tag": "strength 또는 coverage_gap", "title": "카드 제목", "summary": "2~3문장 요약", "stat": "근거 한 줄", "topics": [{"prompt": "AI에게 실제로 물을 법한 자연어 질문", "category": "카테고리", "topic": "토픽"}]}]';

export function buildStrategyPrompt(kind: StrategyKind, digest: string, existingTopicsBlock: string): string {
  const cardRules =
    "카드마다 (1) 한 줄 제목, (2) 왜 중요한지 2~3문장 요약, (3) 근거가 되는 한 줄(stat), (4) 이 전략을 확인할 자연어 질문 3~5개(topics)가 필요합니다. 질문은 사용자가 ChatGPT·Gemini 같은 AI에게 실제로 물을 법한 문장으로, 브랜드명을 넣지 않은 일반 질문 위주로 만드세요.";
  const closing = `\n\n${existingTopicsBlock}\n\n반드시 아래 JSON 배열 형식으로만 답변해주세요. 다른 설명 없이 JSON만 출력하세요:\n\n${CARD_FORMAT}\n\n주의: 위 데이터에 없는 숫자는 만들어내지 마세요. stat과 summary의 수치는 위 데이터에서 그대로 가져오세요.`;
  if (kind === "trend") {
    return `다음은 우리 브랜드와 우리가 다루는 주제들의 네이버 검색 관심도 추세입니다.\n\n${digest}\n\n이 추세에서 "관심이 오르거나 시즌이 다가오는데 우리가 AI 답변에서 놓칠 수 있는 기회 주제(coverage_gap)" 2~3개와 "관심이 꾸준해서 계속 강하게 가져가야 할 주제(strength)" 1~2개를 찾아 카드로 만들어주세요. 관심이 줄어드는 주제는 우선순위를 낮추라는 설명으로만 언급하세요. 값은 상대값이라 "검색량이 몇 배"처럼 절대 검색량으로 해석하지 마세요.\n\n${cardRules}${closing}`;
  }
  return `다음은 우리 사이트를 사이트맵 기준으로 크롤링한 결과입니다.\n\n${digest}\n\n이 결과에서 "AI 답변에 인용되기 어려운 영역(coverage_gap) — FAQ·목차·구조화 데이터가 없거나 렌더링 텍스트가 잘 보이지 않는 페이지 묶음, 또는 페이지 주소에서 보이는 주제 중 답변형 콘텐츠가 부족한 영역" 2~3개와 "이미 잘 갖춰져 있어 인용 가능성이 높은 영역(strength)" 1~2개를 찾아 카드로 만들어주세요. 페이지 주소는 주제 파악의 단서일 뿐, 페이지 내용을 본 것이 아니므로 내용을 단정하지 마세요.\n\n${cardRules}${closing}`;
}

export interface ParsedStrategyCards {
  cards: LlmBrainstormCard[];
}

const VALID_TAGS = new Set(["coverage_gap", "strength"]);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function isValidCard(item: unknown): boolean {
  const c = item as Record<string, unknown>;
  return (
    typeof c?.tag === "string" &&
    VALID_TAGS.has(c.tag) &&
    nonEmpty(c.title) &&
    nonEmpty(c.summary) &&
    typeof c.stat === "string" &&
    Array.isArray(c.topics) &&
    c.topics.length > 0 &&
    c.topics.every((t) => nonEmpty((t as Record<string, unknown>)?.prompt) && nonEmpty((t as Record<string, unknown>)?.category) && nonEmpty((t as Record<string, unknown>)?.topic))
  );
}

/** 코드 블록(```json)이나 설명이 섞여 와도 첫 '['부터 마지막 ']'까지를 다시 시도한다. id는 여기서 부여한다(LLM이 만들면 중복·누락 위험). */
export function parseStrategyCards(answer: string, kind: StrategyKind, batchId = Date.now()): ParsedStrategyCards | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    const start = answer.indexOf("[");
    const end = answer.lastIndexOf("]");
    try {
      if (start === -1 || end <= start) throw new Error("no array");
      parsed = JSON.parse(answer.slice(start, end + 1));
    } catch {
      return { error: "JSON으로 해석할 수 없습니다. LLM이 JSON 배열만 답하도록 다시 시도해주세요." };
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isValidCard)) {
    return { error: "각 카드는 tag(strength|coverage_gap)/title/summary/stat/topics(prompt·category·topic)를 모두 가져야 합니다. 형식을 확인해주세요." };
  }
  const prefix = STRATEGY_KINDS[kind].idPrefix;
  return {
    cards: (parsed as Omit<LlmBrainstormCard, "id">[]).map((card, i) => ({
      id: `${prefix}-${batchId}-${i}`,
      tag: card.tag,
      title: card.title.trim(),
      summary: card.summary.trim(),
      stat: card.stat,
      topics: card.topics.map((t) => ({ prompt: t.prompt.trim(), category: t.category.trim(), topic: t.topic.trim() })),
    })),
  };
}
