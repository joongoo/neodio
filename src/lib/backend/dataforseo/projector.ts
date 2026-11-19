import { aioKeywordIdsForPrompts, saveAioObservation } from "@/lib/backend/aio/store";
import { getPromptStore } from "@/lib/backend/database";
import type { CollectedRunFile } from "@/lib/backend/collectionRunsTypes";
import type { AioCitation, PromptRunMetadata, PromptRunSeed } from "@/lib/db/types";
import type { DataForSeoSurface, NormalizedAiObservation, ProviderTaskRecord } from "./types";
import { getManagedBrandById } from "../brandsManagementStore";
import { listBrandYoutubeChannels } from "../brandAioConfig";
import { buildJudgeContext, judgeCitations } from "../aio/judge";
import { lookupAioVideo, toRawAioCitation } from "../aio/citationEnrichment";

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

interface ProjectorDependencies {
  getStore: () => Promise<Pick<Awaited<ReturnType<typeof getPromptStore>>, "importRun">>;
  getBrand: typeof getManagedBrandById;
  getChannels: typeof listBrandYoutubeChannels;
  getKeywordIds: typeof aioKeywordIdsForPrompts;
  saveObservation: typeof saveAioObservation;
  lookupVideo: typeof lookupAioVideo;
}

const defaultDependencies: ProjectorDependencies = { getStore: getPromptStore, getBrand: getManagedBrandById,
  getChannels: listBrandYoutubeChannels, getKeywordIds: aioKeywordIdsForPrompts,
  saveObservation: saveAioObservation, lookupVideo: lookupAioVideo };

export class PostgresObservationProjector implements ObservationProjector {
  private readonly dependencies: ProjectorDependencies;
  constructor(overrides: Partial<ProjectorDependencies> = {}) { this.dependencies = { ...defaultDependencies, ...overrides }; }

  async project(task: ProviderTaskRecord, observation: NormalizedAiObservation): Promise<void> {
    const deps = this.dependencies;
    const file = observationRunFile(task, observation);
    let citations: AioCitation[] = [];
    if (task.surface === "google-aio" && task.brandId && observation.outcome === "ai_answered") {
      const brand = await deps.getBrand(task.brandId);
      if (!brand || brand.organizationId !== task.organizationId) throw new Error("AIO 판정 대상 브랜드의 조직이 일치하지 않습니다.");
      const channels = await deps.getChannels(task.brandId);
      citations = await judgeCitations(observation.citations.map(citation => ({ ...citation, position: citation.order })),
        buildJudgeContext(brand, channels.map(channel => channel.channelId)), deps.lookupVideo);
      file.promptRun.rawMetadata.citations = citations.map(toRawAioCitation);
    }
    const store = await deps.getStore();
    await store.importRun(task.organizationId, file, null, task.promptId);

    // The dedicated AIO dashboard currently represents only Google AI Overview.
    if (task.surface !== "google-aio" || !task.brandId || !task.promptId) return;
    const keywordIds = await deps.getKeywordIds(task.brandId, [task.promptId]);
    for (const keywordId of keywordIds) {
      await deps.saveObservation(task.brandId, {
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
