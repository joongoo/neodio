import { LlmRequestError, type LlmAnswer, type LlmProvider } from "../types";
import type { RawCitationMetadata } from "@/lib/db/types";

// Gemini API — Interactions 엔드포인트 + google_search 도구(웹 검색 근거).
// 문서: https://ai.google.dev/gemini-api/docs/google-search
// 응답의 steps[] 중 model_output 단계 content[].text에 본문이, 같은 블록의
// annotations[](type=url_citation: url·title)에 출처가 들어 있다.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

interface Annotation { type?: string; url?: string; title?: string }
interface ContentBlock { type?: string; text?: string; annotations?: Annotation[] }
interface Step { type?: string; content?: ContentBlock[]; queries?: string[] }

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// 근거 링크가 Google 중계 주소(vertexaisearch…/grounding-api-redirect)로 오면 실제 주소로 풀어 도메인을 얻는다.
async function resolveRedirect(url: string, signal?: AbortSignal) {
  if (!hostname(url).endsWith("vertexaisearch.cloud.google.com")) return url;
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual", signal });
    return res.headers.get("location") ?? url;
  } catch {
    return url;
  }
}

export const geminiProvider: LlmProvider = {
  id: "gemini",
  llmModelId: "model-gemini-25",
  apiKeyEnv: "GEMINI_API_KEY",
  modelEnv: "GEMINI_MODEL",
  defaultModel: "gemini-3.5-flash-lite",

  async ask(query, { apiKey, model = geminiProvider.defaultModel, webSearch = true, locale, signal }): Promise<LlmAnswer> {
    const body: Record<string, unknown> = { model, input: query };
    if (webSearch) body.tools = [{ type: "google_search" }];
    if (locale) body.system_instruction = `Answer in the language of the user's question. The user is located in the market for locale ${locale}.`;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new LlmRequestError(`Gemini API ${res.status}: ${detail}`, res.status, res.status === 429 || res.status >= 500);
    }
    const json = (await res.json()) as { steps?: Step[]; usage?: unknown };

    const steps = json.steps ?? [];
    const blocks = steps.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []);
    const text = blocks.map((b) => b.text ?? "").join("").trim();
    const searchQueries = steps.filter((s) => s.type === "google_search_call").flatMap((s) => s.queries ?? []);

    const seen = new Set<string>();
    const citations: RawCitationMetadata[] = [];
    for (const annotation of blocks.flatMap((b) => b.annotations ?? [])) {
      if (annotation.type !== "url_citation" || !annotation.url) continue;
      const url = await resolveRedirect(annotation.url, signal);
      if (seen.has(url)) continue;
      seen.add(url);
      const domain = hostname(url);
      // 자사 도메인 여부는 화면이 읽을 때 조직의 브랜드 설정으로 다시 계산된다.
      citations.push({ title: annotation.title || domain || url, url, domain, isOwnDomain: false });
    }

    return { text, citations, model, providerData: { searchQueries, usage: json.usage } };
  },
};
