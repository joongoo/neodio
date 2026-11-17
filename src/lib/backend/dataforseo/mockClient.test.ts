import assert from "node:assert/strict";
import test from "node:test";
import { MockDataForSeoClient } from "./mockClient";
import { DataForSeoClient } from "./client";
import { MemoryArtifactStore } from "./artifacts";
import { DataForSeoOrchestrator } from "./orchestrator";
import { MemoryObservationProjector } from "./projector";
import { MemoryProviderTaskStore } from "./taskStore";

test("offline mock completes all three surfaces across client restarts with zero cost", async () => {
  for (const surface of ["google-aio", "google-ai-mode", "naver-aio"] as const) {
    const tasks = new MemoryProviderTaskStore();
    const artifacts = new MemoryArtifactStore();
    const projector = new MemoryObservationProjector();
    const pipeline = () => new DataForSeoOrchestrator(tasks, artifacts, new MockDataForSeoClient(), projector);
    const { task } = await tasks.reserve({ organizationId: "org-test", query: "mock query", surface, device: "desktop", marketId: "market-kr", scheduledWindow: "mock-test" });
    const submitted = await pipeline().submit(task.id);
    assert.match(submitted.providerTaskId!, /^mock-/);
    const result = await pipeline().recover(task.id);
    assert.equal(result.task.status, "completed", JSON.stringify(result));
    assert.equal(result.task.actualCostUsd, 0);
    assert.equal(result.observation?.outcome, "ai_answered");
    assert.match(result.observation?.answerText ?? "", /MOCK/);
  }
});

test("live and mock clients reject recovery IDs from the other mode", async () => {
  await assert.rejects(new MockDataForSeoClient().get("/task_get/real-task"), /real provider/);
  assert.throws(() => new DataForSeoClient().get("/task_get/mock-test"), /Mock tasks/);
});
