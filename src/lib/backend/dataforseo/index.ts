import { LocalArtifactStore, VercelBlobArtifactStore } from "./artifacts";
import { DataForSeoClient } from "./client";
import { DataForSeoOrchestrator } from "./orchestrator";
import { PostgresObservationProjector } from "./projector";
import { PostgresProviderTaskStore } from "./taskStore";

/** Builds the production pipeline. Construction itself performs no network calls. */
export function createDataForSeoOrchestrator(): DataForSeoOrchestrator {
  const artifacts = process.env.VERCEL
    ? new VercelBlobArtifactStore()
    : new LocalArtifactStore();
  return new DataForSeoOrchestrator(
    new PostgresProviderTaskStore(),
    artifacts,
    new DataForSeoClient(),
    new PostgresObservationProjector(),
  );
}
