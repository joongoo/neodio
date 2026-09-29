import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getLlmProvider } from "@/lib/backend/llm/registry";
import { resolveApiKey } from "@/lib/backend/llm/runner";
import { LlmRequestError } from "@/lib/backend/llm/types";
import { overLlmLimit } from "@/lib/backend/llm/rateLimit";
import { getManagedBrands } from "@/lib/backend/brandsManagementStore";
import { fetchPageText, hostOf, PageFetchError } from "@/lib/backend/pageText";

// LLM 브릿지 모달의 "자동 생성" — 사람이 외부 LLM에 붙여넣던 프롬프트를 서버가 대신 LLM API에
// 물어 답변 원문을 돌려준다. 저장은 하지 않는다: 답변은 모달의 붙여넣기 칸에 채워지고,
// 기존 검증(parse)과 /api/llm-bridge 저장을 그대로 거친다. 웹 검색 없이 모델 지식만 쓰므로
// 무료 등급으로도 동작한다.
const MAX_PROMPT_CHARS = 30_000;

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const promptText = typeof body?.promptText === "string" ? body.promptText.trim() : "";
  if (!promptText) return NextResponse.json({ error: "promptText가 필요합니다." }, { status: 400 });
  if (promptText.length > MAX_PROMPT_CHARS) return NextResponse.json({ error: "프롬프트가 너무 깁니다." }, { status: 400 });
  if (overLlmLimit(`generate:${tenant.orgId}`)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  }

  // 페이지를 근거로 답해야 하는 요청(콘텐츠 수정 가이드)은 서버가 그 페이지 본문을 가져와 프롬프트에 붙인다.
  // 조직의 브랜드에 등록된 도메인만 열 수 있다(src/lib/backend/pageText.ts).
  let fullPrompt = promptText;
  let pageChars = 0;
  const sourceUrl = typeof body?.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  if (sourceUrl) {
    const brands = await getManagedBrands(tenant.orgId);
    const allowedHosts = brands.flatMap((b) => [b.url, ...b.urls]).map((u) => hostOf(u)).filter((h): h is string => h !== null);
    try {
      const excerpt = await fetchPageText(sourceUrl, allowedHosts);
      pageChars = excerpt.length;
      fullPrompt = `${promptText}\n\n[페이지 본문 발췌 — 서버가 이 URL에서 가져온 실제 내용]\n${excerpt}\n\n위 발췌를 근거로 구체적으로 답하세요. 발췌에 없는 내용은 추측하지 마세요.`;
    } catch (error) {
      const message = error instanceof PageFetchError ? error.message : "페이지를 가져오지 못했습니다.";
      return NextResponse.json({ error: `${message} 프롬프트를 복사해 직접 붙여넣을 수도 있습니다.` }, { status: 422 });
    }
  }

  const provider = getLlmProvider("gemini");
  let apiKey: string;
  try {
    apiKey = resolveApiKey(provider.apiKeyEnv);
  } catch {
    return NextResponse.json({ error: "자동 생성이 설정되지 않았습니다. 프롬프트를 복사해 직접 붙여넣어 주세요." }, { status: 503 });
  }

  try {
    const answer = await provider.ask(fullPrompt, {
      apiKey,
      model: process.env[provider.modelEnv] || provider.defaultModel,
      webSearch: false,
    });
    if (!answer.text) return NextResponse.json({ error: "빈 답변이 왔습니다. 다시 시도해 주세요." }, { status: 502 });
    return NextResponse.json({ text: answer.text, model: answer.model, pageChars });
  } catch (error) {
    const quota = error instanceof LlmRequestError && error.status === 429;
    return NextResponse.json(
      { error: quota ? "AI 사용 한도에 도달했습니다. 잠시 뒤 다시 시도하거나 직접 붙여넣어 주세요." : "AI 호출에 실패했습니다. 다시 시도하거나 직접 붙여넣어 주세요." },
      { status: quota ? 429 : 502 }
    );
  }
}
