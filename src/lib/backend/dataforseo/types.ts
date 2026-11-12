import type { PromptSurface } from "@/lib/promptSurfaces";

export const DATAFORSEO_SURFACES = ["google-aio", "google-ai-mode", "naver-aio"] as const;
export type DataForSeoSurface = (typeof DATAFORSEO_SURFACES)[number];
export type DataForSeoDevice = "desktop" | "mobile";

export type ProviderTaskStatus =
  | "reserved"
  | "submitting"
  | "submission_unknown"
  | "queued"
  | "collecting"
  | "raw_saved"
  | "normalized"
  | "completed"
  | "provider_failed"
  | "artifact_failed"
  | "projection_failed"
  | "parse_failed"
  | "cancelled";

export type ObservationOutcome = "ai_answered" | "ai_absent" | "collection_error" | "parse_error";

export interface NormalizedCitation {
  order: number;
  title: string;
  url: string;
  domain: string;
  providerPath: string;
}

export interface NormalizedAiObservation {
  observationId: string;
  providerTaskId: string;
  surface: DataForSeoSurface;
  query: string;
  device: DataForSeoDevice;
  collectedAt: string;
  outcome: ObservationOutcome;
  answerText: string | null;
  citations: NormalizedCitation[];
  provider: {
    name: "dataforseo";
    costUsd: number;
    schemaVersion: string | null;
    rawArtifactId: string;
  };
  normalizerVersion: string;
  errorMessage?: string;
}

export interface DataForSeoApiTask {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  data?: Record<string, unknown>;
  result?: unknown[] | null;
}

export interface DataForSeoApiResponse {
  version?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: DataForSeoApiTask[];
}

export interface ProviderTaskRecord {
  id: string;
  organizationId: string;
  brandId: string | null;
  promptId: string | null;
  provider: "dataforseo";
  surface: DataForSeoSurface;
  device: DataForSeoDevice;
  marketId: string;
  querySnapshot: string;
  scheduledWindow: string;
  dedupeKey: string;
  endpoint: string;
  tag: string;
  providerTaskId: string | null;
  status: ProviderTaskStatus;
  attempt: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
  normalizerVersion: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  completedAt: string | null;
}

export type ProviderArtifactKind = "request" | "post_response" | "advanced_result" | "html";

export interface ProviderArtifactRecord {
  id: string;
  providerTaskId: string;
  kind: ProviderArtifactKind;
  objectKey: string;
  contentType: string;
  encoding: string | null;
  byteSize: number;
  checksumSha256: string;
  createdAt: string;
  expiresAt: string | null;
}

export function isDataForSeoSurface(surface: PromptSurface): surface is DataForSeoSurface {
  return (DATAFORSEO_SURFACES as readonly string[]).includes(surface);
}
