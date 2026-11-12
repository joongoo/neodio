import assert from "node:assert/strict";
import test from "node:test";
import { getRunOutcome } from "@/lib/backend/collectionRunsTypes";
import { engineLabel, toRunListRow } from "@/lib/collectionRunList";
import { observationRunFile } from "./projector";
import type { NormalizedAiObservation, ProviderTaskRecord } from "./types";

const task: ProviderTaskRecord = {
  id: "ptask-1", organizationId: "org-1", brandId: "brand-1", promptId: "prompt-1", provider: "dataforseo",
  surface: "google-aio", device: "desktop", marketId: "market-kr", querySnapshot: "CRM 추천",
  scheduledWindow: "2026-11-12", dedupeKey: "dedupe", endpoint: "/v3/serp/google/organic/task_post",
  tag: "neodio:ptask-1", providerTaskId: "remote-1", status: "normalized", attempt: 1,
  estimatedCostUsd: 0.002, actualCostUsd: 0.001, errorCode: null, errorMessage: null,
  normalizerVersion: "dataforseo-v1", createdAt: "2026-11-12T00:00:00.000Z",
  updatedAt: "2026-11-12T00:01:00.000Z", submittedAt: "2026-11-12T00:00:10.000Z", completedAt: null,
};

function observation(outcome: NormalizedAiObservation["outcome"]): NormalizedAiObservation {
  return {
    observationId: "observation-1", providerTaskId: task.id, surface: task.surface, query: task.querySnapshot,
    device: task.device, collectedAt: "2026-11-12T00:01:00.000Z", outcome,
    answerText: outcome === "ai_answered" ? "추천 답변" : null,
    citations: outcome === "ai_answered" ? [{ order: 1, title: "Source", url: "https://example.com/a", domain: "example.com", providerPath: "$.items[0]" }] : [],
    provider: { name: "dataforseo", costUsd: 0.001, schemaVersion: "0.1", rawArtifactId: "artifact-1" },
    normalizerVersion: "dataforseo-v1",
  };
}

test("projects an answered provider observation into the existing prompt run contract", () => {
  const file = observationRunFile(task, observation("ai_answered"));
  const run = file.promptRun;
  assert.equal(run.llmModelId, "model-google-aio");
  assert.equal(run.status, "success");
  assert.equal(file.dir, "dataforseo");
  assert.equal(run.rawMetadata.collectedBy, "dataforseo");
  assert.equal(engineLabel(toRunListRow(file)), "구글AIO · SERP API");
  assert.equal(run.rawMetadata.observationOutcome, "ai_answered");
  assert.equal(run.rawMetadata.providerData?.providerTaskId, task.id);
  assert.equal(run.rawMetadata.citations?.[0].domain, "example.com");
  assert.equal(getRunOutcome(run), "ai-answered");
});

test("keeps AI absence as a successful measurement rather than a collection failure", () => {
  const run = observationRunFile(task, observation("ai_absent")).promptRun;
  assert.equal(run.status, "success");
  assert.equal(run.rawResponse, "");
  assert.equal(getRunOutcome(run), "ai-absent");
});
