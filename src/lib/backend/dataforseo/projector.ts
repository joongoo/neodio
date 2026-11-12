import { aioKeywordIdsForPrompts, saveAioObservation } from "@/lib/backend/aio/store";
import { getPromptStore } from "@/lib/backend/database";
import type { CollectedRunFile } from "@/lib/backend/collectionRunsTypes";
import type { AioCitation, PromptRunMetadata, PromptRunSeed } from "@/lib/db/types";
import type { DataForSeoSurface, NormalizedAiObservation, ProviderTaskRecord } from "./types";

export interface ObservationProjector {
  project(task: ProviderTaskRecord, observation: NormalizedAiObservation): Promise<void>;
}

const MODEL_BY_SURFACE: Record<DataForSeoSurface, string> = {
  "google-aio": "model-google-aio",
  "google-ai-mode": "model-google-ai-overview",
  "naver-aio": "model-naver-overview",
};

const SOURCE_BY_SURFACE: Record<DataForSeoSurface, PromptRunMetadata["source"]> = {
  "google-aio": "google-aio",
  "google-ai-mode": "google-ai-overview",
  "naver-aio": "naver-overview",
};

export function observationRunFile(task: ProviderTaskRecord, observation: NormalizedAiObservation): CollectedRunFile {
  const successfulObservation = observation.outcome === "ai_answered" || observation.outcome === "ai_absent";
  const promptRun: PromptRunSeed = {
    id: `run-${task.id}`,
    promptId: task.promptId ?? "manual",
    llmModelId: MODEL_BY_SURFACE[task.surface],
    marketId: task.marketId,
    runAt: observation.collectedAt,
    status: successfulObservation ? "success" : "failed",
    rawResponse: observation.answerText ?? "",
    rawMetadata: {
      source: SOURCE_BY_SURFACE[task.surface],
      collectedBy: "dataforseo",
      locale: "ko-KR",
      query: task.querySnapshot,
      answerTextLength: observation.answerText?.length ?? 0,
      observationOutcome: observation.outcome,
      errorMessage: observation.errorMessage ?? null,
      citations: observation.citations.map((citation) => ({
        title: citation.title,
        url: citation.url,
        domain: citation.domain,
        isOwnDomain: false,
        position: citation.order,
        sourceType: "other",
      })),
      providerData: {
        provider: "dataforseo",
        providerTaskId: task.id,
        remoteTaskId: task.providerTaskId,
        costUsd: observation.provider.costUsd,
        schemaVersion: observation.provider.schemaVersion,
        rawArtifactId: observation.provider.rawArtifactId,
        normalizerVersion: observation.normalizerVersion,
      },
    },
  };
  return { dir: "dataforseo", filename: `${task.id}.json`, promptRun };
}

function youtubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) return url.searchParams.get("v");
  } catch { /* Invalid provider URL is retained as a generic citation. */ }
  return null;
}

function aioCitations(observation: NormalizedAiObservation): AioCitation[] {
  return observation.citations.map((citation) => {
    const videoId = youtubeVideoId(citation.url);
    return {
      position: citation.order,
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      sourceType: videoId ? "other_youtube" : "other",
      videoId,
      channelId: null,
      startSeconds: null,
    };
  });
}

export class PostgresObservationProjector implements ObservationProjector {
  async project(task: ProviderTaskRecord, observation: NormalizedAiObservation): Promise<void> {
    const store = await getPromptStore();
    await store.importRun(task.organizationId, observationRunFile(task, observation), null, task.promptId);

    // The dedicated AIO dashboard currently represents only Google AI Overview.
    if (task.surface !== "google-aio" || !task.brandId || !task.promptId) return;
    const keywordIds = await aioKeywordIdsForPrompts(task.brandId, [task.promptId]);
    const citations = aioCitations(observation);
    for (const keywordId of keywordIds) {
      await saveAioObservation(task.brandId, {
        providerTaskId: task.id,
        keywordId,
        device: task.device,
        country: "kr",
        language: "ko",
        collectedAt: observation.collectedAt,
        status: observation.outcome === "ai_answered" ? "aio_present" : "aio_absent",
        aioText: observation.answerText,
        paragraphs: observation.answerText ? [{ text: observation.answerText, sources: citations.map((item) => item.position) }] : [],
        citations,
        screenshotPath: null,
        htmlPath: null,
        errorMessage: null,
      });
    }
  }
}

export class MemoryObservationProjector implements ObservationProjector {
  readonly projections: Array<{ task: ProviderTaskRecord; observation: NormalizedAiObservation }> = [];

  async project(task: ProviderTaskRecord, observation: NormalizedAiObservation): Promise<void> {
    this.projections.push({ task, observation });
  }
}
