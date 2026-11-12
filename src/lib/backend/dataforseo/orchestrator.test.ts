import assert from "node:assert/strict";
import test from "node:test";
import { MemoryArtifactStore } from "./artifacts";
import { DataForSeoClient, DataForSeoDisabledError } from "./client";
import { DataForSeoOrchestrator } from "./orchestrator";
import { MemoryObservationProjector } from "./projector";
import { MemoryProviderTaskStore } from "./taskStore";

const input = {
  organizationId: "org-1",
  brandId: null,
  promptId: null,
  query: "CRM 추천",
  surface: "google-ai-mode" as const,
  device: "desktop" as const,
  marketId: "market-kr",
  scheduledWindow: "2026-11-12",
};

test("같은 관측은 한 번만 예약한다", async () => {
  const store = new MemoryProviderTaskStore();
  const first = await store.reserve(input);
  const second = await store.reserve(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.task.id, first.task.id);
});

test("비활성화 상태에서는 artifact와 fetch를 건드리지 않는다", async () => {
  const store = new MemoryProviderTaskStore();
  const artifacts = new MemoryArtifactStore();
  let fetchCalls = 0;
  const client = new DataForSeoClient({ enabled: false, login: "x", password: "y", fetchImpl: async () => { fetchCalls += 1; return Response.json({}); } });
  const orchestrator = new DataForSeoOrchestrator(store, artifacts, client, new MemoryObservationProjector());
  const { task } = await orchestrator.reserve(input);
  await assert.rejects(orchestrator.submit(task.id), DataForSeoDisabledError);
  assert.equal(fetchCalls, 0);
  assert.equal(artifacts.bodies.size, 0);
  assert.equal((await store.get(task.id))?.status, "reserved");
});

test("가짜 POST와 GET으로 제출·회수·정규화를 완료한다", async () => {
  const store = new MemoryProviderTaskStore();
  const artifacts = new MemoryArtifactStore();
  const responses = [
    { status_code: 20000, tasks: [{ id: "provider-1", status_code: 20100, status_message: "Task Created", cost: 0.0012 }] },
    { status_code: 20000, version: "0.1", tasks: [{ id: "provider-1", status_code: 20000, status_message: "Ok", cost: 0.0012,
      data: { se_type: "ai_mode" }, result: [{ items: [{ type: "ai_overview", markdown: "HubSpot을 추천합니다.", references: [
        { type: "ai_overview_reference", title: "HubSpot", url: "https://hubspot.com/kr" },
      ] }] }] }] },
  ];
  let fetchCalls = 0;
  const client = new DataForSeoClient({
    enabled: true, login: "x", password: "y",
    fetchImpl: async () => { const value = responses[fetchCalls++]; return Response.json(value); },
  });
  const projector = new MemoryObservationProjector();
  const orchestrator = new DataForSeoOrchestrator(store, artifacts, client, projector);
  const { task } = await orchestrator.reserve(input);
  const submitted = await orchestrator.submit(task.id);
  assert.equal(submitted.status, "queued");
  assert.equal(submitted.providerTaskId, "provider-1");
  const recovered = await orchestrator.recover(task.id);
  assert.equal(recovered.task.status, "completed");
  assert.equal(recovered.observation?.outcome, "ai_answered");
  assert.equal(recovered.observation?.citations[0].domain, "hubspot.com");
  assert.equal(projector.projections.length, 1);
  assert.equal(fetchCalls, 2);
  assert.deepEqual([...store.artifacts.values()].map((item) => item.kind).sort(), ["advanced_result", "post_response", "request"]);
});
