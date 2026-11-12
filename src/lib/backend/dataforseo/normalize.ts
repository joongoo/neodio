import { apiTaskComplete, firstApiTask } from "./client";
import type {
  DataForSeoApiResponse,
  DataForSeoApiTask,
  DataForSeoDevice,
  DataForSeoSurface,
  NormalizedAiObservation,
  NormalizedCitation,
} from "./types";

export const DATAFORSEO_NORMALIZER_VERSION = "dataforseo-v1";

interface NormalizeContext {
  observationId: string;
  providerTaskId: string;
  surface: DataForSeoSurface;
  query: string;
  device: DataForSeoDevice;
  collectedAt: string;
  rawArtifactId: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function walk(value: unknown, visitor: (node: Record<string, unknown>, path: string, parents: Record<string, unknown>[]) => void, path = "$", parents: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visitor, `${path}[${index}]`, parents));
    return;
  }
  const node = object(value);
  if (!node) return;
  visitor(node, path, parents);
  for (const [key, entry] of Object.entries(node)) walk(entry, visitor, `${path}.${key}`, [...parents, node]);
}

function normalizedUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function markdownUrls(markdown: string | null): string[] {
  if (!markdown) return [];
  return [...markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].map((match) => match[1]);
}

function baseObservation(context: NormalizeContext, response: DataForSeoApiResponse, task: DataForSeoApiTask) {
  return {
    observationId: context.observationId,
    providerTaskId: context.providerTaskId,
    surface: context.surface,
    query: context.query,
    device: context.device,
    collectedAt: context.collectedAt,
    provider: {
      name: "dataforseo" as const,
      costUsd: Number(task.cost ?? response.cost ?? 0),
      schemaVersion: response.version ?? null,
      rawArtifactId: context.rawArtifactId,
    },
    normalizerVersion: DATAFORSEO_NORMALIZER_VERSION,
  };
}

function failedObservation(context: NormalizeContext, response: DataForSeoApiResponse, task: DataForSeoApiTask, errorMessage: string): NormalizedAiObservation {
  return { ...baseObservation(context, response, task), outcome: "collection_error", answerText: null, citations: [], errorMessage };
}

function googleAnswerText(aiOverview: Record<string, unknown>): string | null {
  const direct = text(aiOverview.markdown) ?? text(aiOverview.text);
  if (direct) return direct;
  const parts: string[] = [];
  walk(aiOverview.items, (node) => {
    const part = text(node.markdown) ?? text(node.text);
    if (part && !parts.includes(part)) parts.push(part);
  });
  return parts.length ? parts.join("\n\n") : null;
}

function googleCitations(aiOverview: Record<string, unknown>): NormalizedCitation[] {
  const byUrl = new Map<string, NormalizedCitation>();
  const add = (rawUrl: unknown, node: Record<string, unknown>, path: string) => {
    const url = normalizedUrl(rawUrl);
    if (!url || byUrl.has(url)) return;
    byUrl.set(url, {
      order: byUrl.size + 1,
      title: text(node.title) ?? text(node.source) ?? hostname(url),
      url,
      domain: text(node.domain) ?? hostname(url),
      providerPath: path,
    });
  };
  walk(aiOverview, (node, path) => {
    if (typeof node.url === "string") {
      const isReference = node.type === "ai_overview_reference" || path.includes(".references[");
      add(node.url, node, `${path}${isReference ? ".reference" : ".link"}`);
    }
    for (const url of markdownUrls(text(node.markdown))) add(url, node, `${path}.markdown`);
  });
  return [...byUrl.values()];
}

export function normalizeGoogleResult(context: NormalizeContext, response: DataForSeoApiResponse): NormalizedAiObservation {
  const task = firstApiTask(response);
  if (!apiTaskComplete(task)) return failedObservation(context, response, task, `Provider task가 완료되지 않았습니다: ${task.status_code ?? "unknown"}`);

  const expectedSearchType = context.surface === "google-aio" ? "organic" : "ai_mode";
  const responseSearchType = text(task.data?.se_type) ?? text(object(task.result?.[0])?.se_type);
  if (responseSearchType && responseSearchType !== expectedSearchType) {
    return { ...baseObservation(context, response, task), outcome: "parse_error", answerText: null, citations: [], errorMessage: `표면 불일치: expected=${expectedSearchType}, actual=${responseSearchType}` };
  }

  let aiOverview: Record<string, unknown> | null = null;
  walk(task.result, (node) => { if (!aiOverview && node.type === "ai_overview") aiOverview = node; });
  if (!aiOverview) return { ...baseObservation(context, response, task), outcome: "ai_absent", answerText: null, citations: [] };
  const overview = aiOverview as Record<string, unknown>;
  const answerText = googleAnswerText(overview);
  if (!answerText) {
    return { ...baseObservation(context, response, task), outcome: "parse_error", answerText: null, citations: [], errorMessage: "ai_overview는 있지만 본문을 추출하지 못했습니다." };
  }
  return { ...baseObservation(context, response, task), outcome: "ai_answered", answerText, citations: googleCitations(overview) };
}

function extractJsonObject(source: string, start: number): Record<string, unknown> | null {
  if (start < 0 || source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) {
      try { return object(JSON.parse(source.slice(start, index + 1))); }
      catch { return null; }
    }
  }
  return null;
}

function naverPayload(html: string): Record<string, unknown> | null {
  const marker = '{"refs":{"blockId":"ai-briefing/';
  return extractJsonObject(html, html.indexOf(marker));
}

function cleanNaverMarkdown(markdown: string): string {
  return markdown
    .replace(/<template\b[^>]*><\/template>/gi, "")
    .replace(/<template\b[^>]*\/>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function naverProps(payload: Record<string, unknown>): Record<string, unknown> | null {
  return object(object(payload.body)?.props);
}

export function extractNaverHtml(response: DataForSeoApiResponse): string {
  const task = firstApiTask(response);
  const pages: string[] = [];
  walk(task.result, (node) => { if (typeof node.html === "string") pages.push(node.html); });
  return pages.join("\n");
}

export function normalizeNaverResult(context: NormalizeContext, response: DataForSeoApiResponse): NormalizedAiObservation {
  const task = firstApiTask(response);
  if (!apiTaskComplete(task)) return failedObservation(context, response, task, `Provider task가 완료되지 않았습니다: ${task.status_code ?? "unknown"}`);
  const html = extractNaverHtml(response);
  if (!html) return { ...baseObservation(context, response, task), outcome: "parse_error", answerText: null, citations: [], errorMessage: "Naver HTML 결과가 비어 있습니다." };

  const payload = naverPayload(html);
  const hasAiSignal = html.includes("AI 브리핑") || html.includes('aibType":"answertype') || html.includes("ai_briefing");
  if (!payload) {
    return hasAiSignal
      ? { ...baseObservation(context, response, task), outcome: "parse_error", answerText: null, citations: [], errorMessage: "AI 브리핑 신호는 있지만 내장 JSON을 파싱하지 못했습니다." }
      : { ...baseObservation(context, response, task), outcome: "ai_absent", answerText: null, citations: [] };
  }

  const props = naverProps(payload);
  const summary = object(props?.summary);
  const answerText = text(summary?.markdown);
  if (!answerText) {
    return { ...baseObservation(context, response, task), outcome: "parse_error", answerText: null, citations: [], errorMessage: "Naver AI 브리핑 본문을 추출하지 못했습니다." };
  }

  const citations: NormalizedCitation[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of (Array.isArray(props?.sources) ? props.sources : []).entries()) {
    const source = object(entry);
    const url = normalizedUrl(source?.url);
    if (!source || !url || seen.has(url)) continue;
    seen.add(url);
    citations.push({
      order: citations.length + 1,
      title: text(source.title) ?? text(source.sourceName) ?? hostname(url),
      url,
      domain: hostname(url),
      providerPath: `$.body.props.sources[${index}]`,
    });
  }
  return { ...baseObservation(context, response, task), outcome: "ai_answered", answerText: cleanNaverMarkdown(answerText), citations };
}

export function normalizeDataForSeoResult(context: NormalizeContext, response: DataForSeoApiResponse): NormalizedAiObservation {
  return context.surface === "naver-aio" ? normalizeNaverResult(context, response) : normalizeGoogleResult(context, response);
}
