import { VercelBlobArtifactStore } from "./artifacts";
import { DataForSeoClient } from "./client";
import { DataForSeoOrchestrator } from "./orchestrator";
import { PostgresObservationProjector } from "./projector";
import { PostgresProviderTaskStore } from "./taskStore";

/** Builds the production pipeline. Construction itself performs no network calls. */
export function createDataForSeoOrchestrator(): DataForSeoOrchestrator {
  return new DataForSeoOrchestrator(
    new PostgresProviderTaskStore(),
    new VercelBlobArtifactStore(),
    new DataForSeoClient(),
    new PostgresObservationProjector(),
  );
}
