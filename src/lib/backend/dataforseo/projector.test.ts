import assert from "node:assert/strict";
import test from "node:test";
import { getRunOutcome } from "@/lib/backend/collectionRunsTypes";
import { engineLabel, toRunListRow } from "@/lib/collectionRunList";
import { observationRunFile, PostgresObservationProjector } from "./projector";
import type { NormalizedAiObservation, ProviderTaskRecord } from "./types";
import type { ManagedBrand, YoutubeVideoMeta } from "@/lib/db/types";
import type { CollectedRunFile } from "../collectionRunsTypes";
import type { AioObservationInput } from "../aio/store";
import { buildJudgeContext, judgeCitations } from "../aio/judge";

const task: ProviderTaskRecord = {
  id: "ptask-1", organizationId: "org-1", brandId: "brand-1", promptId: "prompt-1",
  collectionRequestId: "creq-1", retryOfTaskId: null, provider: "dataforseo",
  surface: "google-aio", device: "desktop", marketId: "market-kr", querySnapshot: "CRM 추천",
  scheduledWindow: "2026-11-12", dedupeKey: "dedupe", endpoint: "/v3/serp/google/organic/task_post",
  tag: "neodio:ptask-1", providerTaskId: "remote-1", status: "normalized", attempt: 1,
  estimatedCostUsd: 0.002, actualCostUsd: 0.001, errorCode: null, errorMessage: null,
  normalizerVersion: "dataforseo-v1", submissionAttemptedAt: "2026-11-12T00:00:09.000Z",
  leaseOwner: null, leaseExpiresAt: null, nextPollAt: null, createdAt: "2026-11-12T00:00:00.000Z",
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

const brand = { organizationId: "org-1", url: "https://own.example", urls: [], otherBrands: [{ name: "Competitor", aliases: [] }] } as unknown as ManagedBrand;

function harness(overrides: ConstructorParameters<typeof PostgresObservationProjector>[0] = {}) {
  const files: CollectedRunFile[] = [], saved: AioObservationInput[] = [], lookups: string[] = [];
  const lookupVideo = async (id: string): Promise<YoutubeVideoMeta | null> => {
    lookups.push(id);
    return id === "ccccccccccc" ? null : { videoId: id, channelId: id === "aaaaaaaaaaa" ? "own-channel" : "other-channel", title: `Video ${id}`, thumbnailUrl: "" };
  };
  const projector = new PostgresObservationProjector({
    getStore: async () => ({ importRun: async (_org, file) => { files.push(file); return "prompt-1"; } }),
    getBrand: async () => brand,
    getChannels: async () => [{ channelId: "own-channel", handle: null, title: "Own", thumbnailUrl: null, addedAt: "2026-11-18" }],
    getKeywordIds: async () => ["keyword-1"],
    saveObservation: async (_brand, input) => { saved.push(input); return "aioobs-1"; },
    lookupVideo,
    ...overrides,
  });
  return { projector, files, saved, lookups, lookupVideo };
}

test("SERP AIO uses the collector judge for own video/web, competitor and other citations in both stores", async () => {
  const fixture = harness();
  const value = observation("ai_answered");
  value.citations = [
    ["https://www.youtube.com/watch?v=aaaaaaaaaaa&t=42", "youtube.com"],
    ["https://help.own.example/article", "help.own.example"],
    ["https://blog.competitor.com/article", "blog.competitor.com"],
    ["https://youtu.be/bbbbbbbbbbb", "youtu.be"],
    ["https://news.example/article", "news.example"],
    ["https://www.youtube.com/shorts/ccccccccccc", "youtube.com"],
  ].map(([url, domain], index) => ({ order: index + 1, title: `Source ${index}`, url, domain, providerPath: "test" }));
  await fixture.projector.project(task, value);
  const citations = fixture.saved[0].citations;
  assert.deepEqual(citations.map(citation => citation.sourceType), ["own_video", "own_web", "competitor", "other_youtube", "other", "other_youtube"]);
  assert.equal(citations[0].channelId, "own-channel");
  assert.equal(citations[0].startSeconds, 42);
  assert.equal(citations[0].title, "Video aaaaaaaaaaa");
  assert.equal(citations[5].channelId, null, "unresolved video is not assumed to be ours");
  const originalJudge = await judgeCitations(value.citations.map(citation => ({ ...citation, position: citation.order })), buildJudgeContext(brand, ["own-channel"]), fixture.lookupVideo);
  assert.deepEqual(citations, originalJudge, "same function and context as local collector");
  const metadata = fixture.files[0].promptRun.rawMetadata;
  assert.deepEqual(metadata.citations?.map(citation => citation.sourceType), citations.map(citation => citation.sourceType));
  assert.deepEqual(metadata.citations?.map(citation => citation.isOwnDomain), [true, true, false, false, false, false]);
  assert.equal(metadata.collectedBy, "dataforseo");
  assert.equal(fixture.saved[0].providerTaskId, task.id);
  assert.equal(fixture.saved[0].status, "aio_present");
});

test("AI absence makes no video lookups and still saves an absent observation", async () => {
  const fixture = harness({ getBrand: async () => { throw Error("brand lookup is unnecessary for absence"); } });
  await fixture.projector.project(task, observation("ai_absent"));
  assert.deepEqual(fixture.lookups, []);
  assert.equal(fixture.saved[0].status, "aio_absent");
  assert.deepEqual(fixture.saved[0].citations, []);
  assert.equal(fixture.files[0].promptRun.status, "success");
});

test("non-Google AIO surfaces do not enter the dedicated dashboard judgment path", async () => {
  const fixture = harness({ getBrand: async () => { throw Error("not Google AIO"); }, getKeywordIds: async () => { throw Error("not Google AIO"); } });
  await fixture.projector.project({ ...task, surface: "naver-aio" }, observation("ai_answered"));
  assert.equal(fixture.files.length, 1);
  assert.equal(fixture.saved.length, 0);
  assert.deepEqual(fixture.lookups, []);
});

test("brand scope mismatch fails before overwriting any run or AIO observation", async () => {
  const fixture = harness({ getBrand: async () => ({ ...brand, organizationId: "another-org" }) });
  await assert.rejects(fixture.projector.project(task, observation("ai_answered")), /조직이 일치하지 않습니다/);
  assert.equal(fixture.files.length, 0);
  assert.equal(fixture.saved.length, 0);
});
