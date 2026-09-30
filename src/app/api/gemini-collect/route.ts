import { NextRequest, NextResponse } from "next/server";
import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { getLlmProvider } from "@/lib/backend/llm/registry";
import { resolveApiKey, runLlmQuery } from "@/lib/backend/llm/runner";
import { overLlmLimit } from "@/lib/backend/llm/rateLimit";

// 프롬프트 라이브러리 "선택 수집"의 Gemini 단계 — 프롬프트 1개를 Gemini API에 물어 답변·출처를 prompt_runs에 저장한다.
// 화면이 프롬프트마다 한 번씩 순서대로 부른다(서버리스 함수 시간 제한 안에서 끝나도록 1건씩).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "query가 필요합니다." }, { status: 400 });
  if (query.length > 500) return NextResponse.json({ error: "프롬프트가 너무 깁니다." }, { status: 400 });
  if (overLlmLimit(`gemini-collect:${tenant.orgId}`, 30)) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요." }, { status: 429 });
  }

  const provider = getLlmProvider("gemini");
  let apiKey: string;
  try {
    apiKey = resolveApiKey(provider.apiKeyEnv);
  } catch {
    return NextResponse.json({ error: "Gemini 수집이 설정되지 않았습니다. 서버에 GEMINI_API_KEY가 필요합니다." }, { status: 503 });
  }

  const store = await getPromptStore();
  const result = await runLlmQuery({
    store,
    orgId: tenant.orgId,
    provider,
    query,
    apiKey,
    webSearch: true,
    fallbackWithoutSearch: true,
    locale: "ko-KR",
    retries: 1,
  });
  if (result.status === "failed") {
    return NextResponse.json({ error: result.errorMessage ?? "Gemini 호출에 실패했습니다." }, { status: 502 });
  }
  return NextResponse.json({ runId: result.runId, citations: result.citations });
}
