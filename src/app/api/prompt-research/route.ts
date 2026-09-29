import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getLlmBridgeEntry, setLlmBridgeEntry } from "@/lib/backend/llmBridgeStore";
import { getLlmProvider } from "@/lib/backend/llm/registry";
import { resolveApiKey } from "@/lib/backend/llm/runner";
import { overLlmLimit } from "@/lib/backend/llm/rateLimit";
import { LlmRequestError } from "@/lib/backend/llm/types";
import { buildPromptResearchPrompt, parsePromptResearch, type GeneratedPromptResearch } from "@/lib/promptResearch";

// 프롬프트 리서치 — 토픽을 넣으면 AI가 관련 토픽·질문을 제안한다. 같은 토픽·마켓은 저장해 둔 결과를 그대로
// 돌려주고(호출 없음), 사용자가 "다시 생성"(refresh)을 눌렀을 때만 새로 호출한다.
const SCOPE = "prompt-research";
const MAX_TOPIC_CHARS = 80;
const MARKETS = new Set(["한국 (KR)", "미국 (US)", "전세계"]);

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim().replace(/\s+/g, " ") : "";
  const market = typeof body?.market === "string" && MARKETS.has(body.market) ? body.market : "한국 (KR)";
  const refresh = body?.refresh === true;
  if (!topic) return NextResponse.json({ error: "토픽을 입력하세요." }, { status: 400 });
  if (topic.length > MAX_TOPIC_CHARS) return NextResponse.json({ error: `토픽은 ${MAX_TOPIC_CHARS}자 이내로 입력하세요.` }, { status: 400 });

  const key = `${market}::${topic.toLocaleLowerCase("ko-KR")}`;
  if (!refresh) {
    const cached = await getLlmBridgeEntry<GeneratedPromptResearch>(tenant.orgId, SCOPE, key);
    if (cached) return NextResponse.json({ result: cached, cached: true });
  }
  if (overLlmLimit(`research:${tenant.orgId}`, 6)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  }

  const provider = getLlmProvider("gemini");
  let apiKey: string;
  try {
    apiKey = resolveApiKey(provider.apiKeyEnv);
  } catch {
    return NextResponse.json({ error: "리서치 기능이 설정되지 않았습니다." }, { status: 503 });
  }

  try {
    const answer = await provider.ask(buildPromptResearchPrompt(topic, market), {
      apiKey,
      model: process.env[provider.modelEnv] || provider.defaultModel,
      webSearch: false,
    });
    const parsed = parsePromptResearch(answer.text, topic);
    if ("error" in parsed) return NextResponse.json({ error: `${parsed.error} 다시 시도해 주세요.` }, { status: 502 });
    const result: GeneratedPromptResearch = { topic, ...parsed, generatedAt: new Date().toISOString(), model: answer.model };
    await setLlmBridgeEntry(tenant.orgId, SCOPE, key, result);
    return NextResponse.json({ result, cached: false });
  } catch (error) {
    const quota = error instanceof LlmRequestError && error.status === 429;
    return NextResponse.json(
      { error: quota ? "AI 사용 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요." : "AI 호출에 실패했습니다. 다시 시도해 주세요." },
      { status: quota ? 429 : 502 }
    );
  }
}
