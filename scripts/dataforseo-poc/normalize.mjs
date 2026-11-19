import { isTaskComplete, isTaskFailure } from "./client.mjs";

function isObject(value) {
  return value !== null && typeof value === "object";
}

function walk(value, visitor, path = "$", ancestors = []) {
  if (!isObject(value)) return;
  visitor(value, path, ancestors);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, visitor, `${path}[${index}]`, [...ancestors, value]));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    walk(entry, visitor, `${path}.${key}`, [...ancestors, value]);
  }
}

function cleanText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function answerText(aiOverview) {
  const direct = cleanText(aiOverview.markdown) ?? cleanText(aiOverview.text);
  if (direct) return direct;

  const parts = [];
  walk(aiOverview.items, (node) => {
    if (node === aiOverview) return;
    const text = cleanText(node.markdown) ?? cleanText(node.text);
    if (text && !parts.includes(text)) parts.push(text);
  });
  return parts.length ? parts.join("\n\n") : null;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function markdownUrls(markdown) {
  if (!markdown) return [];
  return [...markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].map((match) => match[1]);
}

export function normalizeResult({ surface, submission, result }) {
  const submittedTask = submission?.tasks?.[0] ?? null;
  const resultTask = result?.tasks?.[0] ?? null;
  const providerSucceeded = result?.status_code === 20000 && isTaskComplete(resultTask);
  let aiOverview = null;

  walk(resultTask?.result, (node) => {
    if (!aiOverview && node?.type === "ai_overview") aiOverview = node;
  });

  const answer = aiOverview ? answerText(aiOverview) : null;
  const citationOccurrences = [];
  const citationsByUrl = new Map();

  const addCitation = (rawUrl, node, path, origin) => {
    const url = normalizeUrl(rawUrl);
    if (!url) return;
    const occurrence = {
      order: citationOccurrences.length + 1,
      url,
      source: cleanText(node?.source) ?? cleanText(node?.title),
      domain: cleanText(node?.domain),
      origin,
      providerType: cleanText(node?.type),
      providerPath: path,
    };
    citationOccurrences.push(occurrence);
    const existing = citationsByUrl.get(url);
    if (existing) {
      if (!existing.origins.includes(origin)) existing.origins.push(origin);
      if (occurrence.providerType && !existing.providerTypes.includes(occurrence.providerType)) existing.providerTypes.push(occurrence.providerType);
      existing.occurrenceOrders.push(occurrence.order);
      return;
    }
    citationsByUrl.set(url, {
      order: citationsByUrl.size + 1,
      url,
      source: occurrence.source,
      domain: occurrence.domain,
      origins: [origin],
      providerTypes: occurrence.providerType ? [occurrence.providerType] : [],
      firstProviderPath: path,
      occurrenceOrders: [occurrence.order],
    });
  };

  if (aiOverview) {
    walk(aiOverview, (node, path, ancestors) => {
      if (typeof node?.url === "string") {
        const inReference = node.type === "ai_overview_reference" || ancestors.some((ancestor) => ancestor === aiOverview.references);
        addCitation(node.url, node, path, inReference ? "reference" : "link");
      }
      for (const url of markdownUrls(cleanText(node?.markdown))) addCitation(url, node, `${path}.markdown`, "markdown");
    });
  }

  const responseSearchType = cleanText(resultTask?.data?.se_type);
  const expectedSearchType = surface === "google_aio" ? "organic" : surface === "google_ai_mode" ? "ai_mode" : null;

  return {
    surface,
    taskStatus: providerSucceeded ? "succeeded" : isTaskFailure(resultTask) ? "failed" : "unknown",
    aiAnswerStatus: providerSucceeded ? (aiOverview ? "present" : "absent") : "unknown",
    answer,
    citations: [...citationsByUrl.values()],
    citationOccurrences,
    providerTaskId: submittedTask?.id ?? resultTask?.id ?? null,
    providerStatusCode: resultTask?.status_code ?? submittedTask?.status_code ?? null,
    providerStatusMessage: resultTask?.status_message ?? submittedTask?.status_message ?? null,
    actualCostUsd: Number(submittedTask?.cost ?? 0),
    resultCostUsd: Number(resultTask?.cost ?? 0),
    resultItemTypes: resultTask?.result?.flatMap((entry) => entry?.item_types ?? []) ?? [],
    responseSearchType,
    expectedSearchType,
    responseSurfaceMatched: expectedSearchType === null ? null : responseSearchType === expectedSearchType,
  };
}
