import assert from "node:assert/strict";
import test from "node:test";
import { geminiProvider } from "./providers/gemini";
import { LlmRequestError } from "./types";
import { getLlmProvider } from "./registry";

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("gemini answer text and url citations are parsed, duplicates removed", async () => {
  let request: { url: string; body: Record<string, unknown>; key: string | null } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    request = { url, body: JSON.parse(String(init.body)), key: new Headers(init.headers).get("x-goog-api-key") };
    return new Response(JSON.stringify({
      steps: [
        { type: "google_search_call", queries: ["CRM 추천"] },
        { type: "model_output", content: [{ type: "text", text: "HubSpot을 추천합니다.", annotations: [
          { type: "url_citation", url: "https://www.hubspot.com/a", title: "HubSpot" },
          { type: "url_citation", url: "https://www.hubspot.com/a", title: "HubSpot again" },
          { type: "url_citation", url: "https://example.co.kr/x", title: "" },
        ] }] },
      ],
    }), { status: 200 });
  }) as typeof fetch;

  const answer = await geminiProvider.ask("CRM 추천", { apiKey: "k", model: "m" });
  assert.equal(answer.text, "HubSpot을 추천합니다.");
  assert.deepEqual(answer.citations.map((c) => [c.domain, c.title]), [["hubspot.com", "HubSpot"], ["example.co.kr", "example.co.kr"]]);
  assert.deepEqual(answer.providerData?.searchQueries, ["CRM 추천"]);
  assert.equal(request?.key, "k");
  assert.deepEqual(request?.body.tools, [{ type: "google_search" }]);
});

test("web search can be turned off; rate limits are retryable", async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response("quota", { status: 429 });
  }) as typeof fetch;
  await assert.rejects(geminiProvider.ask("q", { apiKey: "k", webSearch: false }), (error) => error instanceof LlmRequestError && error.retryable && error.status === 429);
  assert.equal(body.tools, undefined);
});

test("registry resolves gemini and rejects unknown providers", () => {
  assert.equal(getLlmProvider("gemini").llmModelId, "model-gemini-25");
  assert.throws(() => getLlmProvider("nope"), /알 수 없는 LLM/);
});
