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
  const citations = [];
  const seen = new Set();
  let order = 0;

  const addCitation = (rawUrl, node, path, origin) => {
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push({
      order: ++order,
      url,
      source: cleanText(node?.source) ?? cleanText(node?.title),
      domain: cleanText(node?.domain),
      origin,
      providerPath: path,
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

  return {
    surface,
    taskStatus: providerSucceeded ? "succeeded" : isTaskFailure(resultTask) ? "failed" : "unknown",
    aiAnswerStatus: providerSucceeded ? (aiOverview ? "present" : "absent") : "unknown",
    answer,
    citations,
    providerTaskId: submittedTask?.id ?? resultTask?.id ?? null,
    providerStatusCode: resultTask?.status_code ?? submittedTask?.status_code ?? null,
    providerStatusMessage: resultTask?.status_message ?? submittedTask?.status_message ?? null,
    actualCostUsd: Number(submittedTask?.cost ?? 0),
    resultCostUsd: Number(resultTask?.cost ?? 0),
    resultItemTypes: resultTask?.result?.flatMap((entry) => entry?.item_types ?? []) ?? [],
  };
}
