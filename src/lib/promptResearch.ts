import type { Relevancy, RelatedTopicRow } from "@/lib/db/types";

// 프롬프트 리서치 — 토픽 하나를 넣으면 AI가 "사람들이 이 토픽에 대해 AI에게 실제로 물어볼 관련 토픽과 질문"을
// 제안한다(웹 검색 없이 모델 지식만 쓰므로 무료 등급으로 동작). 프롬프트 만들기와 응답 검증은 순수 함수로 두어
// 서버(API)에서 쓰고 테스트한다.

export interface GeneratedPromptResearch {
  topic: string;
  intent: { informational: number; commercial: number; transactional: number };
  relatedTopics: RelatedTopicRow[];
  generatedAt: string;
  model: string;
}

export const MAX_RELATED_TOPICS = 12;
export const MAX_PROMPTS_PER_TOPIC = 6;

export function buildPromptResearchPrompt(topic: string, market: string): string {
  return `당신은 AI 검색(ChatGPT, Gemini, 네이버 AI 브리핑 등)에서 사람들이 실제로 묻는 질문을 조사하는 리서처입니다.

토픽: "${topic}"
마켓: ${market}

이 토픽과 관련된 하위 토픽 ${MAX_RELATED_TOPICS}개 이내를 찾고, 각 하위 토픽마다 사람들이 AI 챗봇에 자연어로 물어볼 만한 질문을 3~${MAX_PROMPTS_PER_TOPIC}개씩 제안해주세요.

규칙:
- 질문은 특정 브랜드명을 넣지 않은 카테고리/방법/비교/추천형 질문 위주로, 해당 마켓 언어의 자연스러운 문장으로 작성하세요.
- relevancy는 입력 토픽과의 관련도입니다: "Best" | "높음" | "중간" | "낮음".
- intent는 제안한 전체 질문을 검색 의도별로 분류한 개수입니다(정보성 informational, 상업성 commercial, 거래성 transactional).
- 반드시 JSON 하나만 답하세요.

응답 형식:
{"intent": {"informational": 0, "commercial": 0, "transactional": 0}, "relatedTopics": [{"topic": "하위 토픽", "relevancy": "높음", "prompts": ["질문 1", "질문 2"]}]}`;
}

const RELEVANCY = new Set<Relevancy>(["낮음", "중간", "높음", "Best"]);

const slug = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "topic";

export function parsePromptResearch(raw: string, topic: string): { relatedTopics: RelatedTopicRow[]; intent: GeneratedPromptResearch["intent"] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      if (start === -1 || end <= start) throw new Error("no object");
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { error: "AI 답변을 해석하지 못했습니다." };
    }
  }
  const data = parsed as { intent?: Record<string, unknown>; relatedTopics?: unknown };
  if (!data || !Array.isArray(data.relatedTopics)) return { error: "AI 답변 형식이 올바르지 않습니다." };

  const seenTopics = new Set<string>();
  const relatedTopics: RelatedTopicRow[] = [];
  for (const item of data.relatedTopics) {
    const entry = item as { topic?: unknown; relevancy?: unknown; prompts?: unknown };
    const name = typeof entry?.topic === "string" ? entry.topic.trim() : "";
    if (!name || seenTopics.has(name.toLocaleLowerCase("ko-KR"))) continue;
    seenTopics.add(name.toLocaleLowerCase("ko-KR"));
    const seenPrompts = new Set<string>();
    const prompts = (Array.isArray(entry.prompts) ? entry.prompts : [])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => p.trim())
      .filter((p) => !seenPrompts.has(p) && seenPrompts.add(p))
      .slice(0, MAX_PROMPTS_PER_TOPIC);
    if (prompts.length === 0) continue;
    const id = `pr-${slug(topic)}-${relatedTopics.length}`;
    relatedTopics.push({
      id,
      topic: name,
      promptCount: prompts.length,
      relevancy: RELEVANCY.has(entry.relevancy as Relevancy) ? (entry.relevancy as Relevancy) : "중간",
      // AI가 제안한 질문이라 실제 답변 요약·언급 수는 없다.
      subPrompts: prompts.map((prompt, i) => ({ id: `${id}-p${i}`, prompt, model: "", aiResponseSummary: "", brandsMentioned: 0, sourcesCited: 0 })),
    });
    if (relatedTopics.length >= MAX_RELATED_TOPICS) break;
  }
  if (relatedTopics.length === 0) return { error: "제안된 관련 토픽이 없습니다." };

  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);
  let intent = { informational: count(data.intent?.informational), commercial: count(data.intent?.commercial), transactional: count(data.intent?.transactional) };
  if (intent.informational + intent.commercial + intent.transactional === 0) intent = { informational: 1, commercial: 0, transactional: 0 };
  return { relatedTopics, intent };
}
