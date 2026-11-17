import { LocalArtifactStore, VercelBlobArtifactStore } from "./artifacts";
import { DataForSeoClient } from "./client";
import { MockDataForSeoClient } from "./mockClient";
import { DataForSeoOrchestrator } from "./orchestrator";
import { PostgresObservationProjector } from "./projector";
import { PostgresProviderTaskStore, type ProviderTaskStore } from "./taskStore";

/** Builds the production pipeline. Construction itself performs no network calls. */
export function createDataForSeoOrchestrator(taskStore: ProviderTaskStore = new PostgresProviderTaskStore()): DataForSeoOrchestrator {
  const artifacts = process.env.VERCEL
    ? new VercelBlobArtifactStore()
    : new LocalArtifactStore();
  return new DataForSeoOrchestrator(
    taskStore,
    artifacts,
    process.env.DATAFORSEO_MOCK === "true" ? new MockDataForSeoClient() : new DataForSeoClient(),
    new PostgresObservationProjector(),
  );
}
