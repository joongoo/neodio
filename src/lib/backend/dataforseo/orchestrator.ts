import { DATAFORSEO_SURFACE_CONFIG } from "./config";
import { acceptedApiTask, apiTaskComplete, apiTaskFailed, apiTaskPending, DataForSeoClient, DataForSeoRequestError, firstApiTask } from "./client";
import { extractNaverHtml, normalizeDataForSeoResult } from "./normalize";
import type { ArtifactStore } from "./artifacts";
import type { NormalizedAiObservation, ProviderTaskRecord } from "./types";
import type { ProviderTaskStore, ReserveProviderTaskInput } from "./taskStore";
import type { ObservationProjector } from "./projector";

export class DataForSeoOrchestrator {
  constructor(
    private readonly tasks: ProviderTaskStore,
    private readonly artifacts: ArtifactStore,
    private readonly client: DataForSeoClient,
    private readonly projector: ObservationProjector,
  ) {}

  reserve(input: ReserveProviderTaskInput) {
    return this.tasks.reserve(input);
  }

  get(id: string) {
    return this.tasks.get(id);
  }

  async submit(id: string): Promise<ProviderTaskRecord> {
    const task = await this.requireTask(id);
    if (task.status !== "reserved") return task;

    // 기능 플래그와 인증정보를 먼저 검사한다. 비활성 상태에서는 DB·Blob·네트워크를 전혀 건드리지 않는다.
    this.client.assertReady();
    const config = DATAFORSEO_SURFACE_CONFIG[task.surface];
    const payload = [config.payload(task.querySnapshot, task.device, task.tag)];
    const requestArtifact = await this.artifacts.save(task, "request", `${JSON.stringify(payload, null, 2)}\n`, "application/json; charset=utf-8");
    await this.tasks.saveArtifact(requestArtifact);
    let submitting = await this.tasks.update(task.id, "reserved", { status: "submitting", errorCode: null, errorMessage: null });

    let response;
    try {
      response = await this.client.postTasks(config.postPath, payload);
    } catch (error) {
      const requestError = error instanceof DataForSeoRequestError ? error : null;
      return this.tasks.update(submitting.id, "submitting", {
        status: requestError?.submissionMayHaveSucceeded ? "submission_unknown" : "provider_failed",
        errorCode: requestError?.kind ?? "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }

    const accepted = acceptedApiTask(response);
    const submittedAt = new Date().toISOString();
    submitting = { ...submitting, providerTaskId: accepted.id, actualCostUsd: Number(accepted.cost ?? 0), submittedAt };
    try {
      const postArtifact = await this.artifacts.save(submitting, "post_response", `${JSON.stringify(response, null, 2)}\n`, "application/json; charset=utf-8");
      await this.tasks.saveArtifact(postArtifact);
    } catch (error) {
      return this.tasks.update(task.id, "submitting", {
        status: "artifact_failed",
        providerTaskId: accepted.id,
        actualCostUsd: Number(accepted.cost ?? 0),
        submittedAt,
        errorCode: "post_response_artifact",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    return this.tasks.update(task.id, "submitting", {
      status: "queued",
      providerTaskId: accepted.id,
      actualCostUsd: Number(accepted.cost ?? 0),
      submittedAt,
      errorCode: null,
      errorMessage: null,
    });
  }

  async recover(id: string): Promise<{ task: ProviderTaskRecord; observation: NormalizedAiObservation | null }> {
    let task = await this.requireTask(id);
    if (task.status === "completed" || task.status === "parse_failed" || task.status === "provider_failed") {
      return { task, observation: null };
    }
    if (task.status !== "queued" && task.status !== "collecting" && task.status !== "artifact_failed" && task.status !== "projection_failed") {
      throw new Error(`결과를 회수할 수 없는 상태입니다: ${task.status}`);
    }
    if (!task.providerTaskId) throw new Error("Provider task ID가 없습니다.");
    this.client.assertReady();

    const config = DATAFORSEO_SURFACE_CONFIG[task.surface];
    let response;
    try {
      response = await this.client.get(`${config.resultPath}/${task.providerTaskId}`);
    } catch (error) {
      task = await this.tasks.update(task.id, ["queued", "collecting", "artifact_failed", "projection_failed"], {
        status: "collecting",
        errorCode: error instanceof DataForSeoRequestError ? error.kind : "result_fetch",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { task, observation: null };
    }

    const providerTask = firstApiTask(response);
    if (apiTaskPending(providerTask)) {
      task = await this.tasks.update(task.id, ["queued", "collecting", "artifact_failed", "projection_failed"], { status: "collecting", errorCode: null, errorMessage: null });
      return { task, observation: null };
    }
    if (apiTaskFailed(providerTask) || !apiTaskComplete(providerTask)) {
      task = await this.tasks.update(task.id, ["queued", "collecting", "artifact_failed", "projection_failed"], {
        status: "provider_failed",
        errorCode: String(providerTask.status_code ?? "provider"),
        errorMessage: providerTask.status_message ?? "Provider task failed",
        completedAt: new Date().toISOString(),
      });
      return { task, observation: null };
    }

    const artifactBody = task.surface === "naver-aio" ? extractNaverHtml(response) : `${JSON.stringify(response, null, 2)}\n`;
    const contentType = task.surface === "naver-aio" ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
    let artifact;
    try {
      artifact = await this.artifacts.save(task, config.resultKind, artifactBody, contentType);
      await this.tasks.saveArtifact(artifact);
    } catch (error) {
      task = await this.tasks.update(task.id, ["queued", "collecting", "artifact_failed", "projection_failed"], {
        status: "artifact_failed",
        errorCode: "result_artifact",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { task, observation: null };
    }

    task = await this.tasks.update(task.id, ["queued", "collecting", "artifact_failed", "projection_failed"], { status: "raw_saved", errorCode: null, errorMessage: null });
    const observation = normalizeDataForSeoResult({
      observationId: `observation-${task.id}`,
      providerTaskId: task.id,
      surface: task.surface,
      query: task.querySnapshot,
      device: task.device,
      collectedAt: new Date().toISOString(),
      rawArtifactId: artifact.id,
    }, response);
    if (observation.outcome === "parse_error") {
      task = await this.tasks.update(task.id, "raw_saved", {
        status: "parse_failed",
        normalizerVersion: observation.normalizerVersion,
        errorCode: "normalization",
        errorMessage: observation.errorMessage ?? "정규화 실패",
        completedAt: new Date().toISOString(),
      });
      return { task, observation };
    }
    if (observation.outcome === "collection_error") {
      task = await this.tasks.update(task.id, "raw_saved", {
        status: "provider_failed",
        normalizerVersion: observation.normalizerVersion,
        errorCode: "normalization_provider_state",
        errorMessage: observation.errorMessage ?? "Provider 결과 상태 오류",
        completedAt: new Date().toISOString(),
      });
      return { task, observation };
    }
    task = await this.tasks.update(task.id, "raw_saved", { status: "normalized", normalizerVersion: observation.normalizerVersion });
    try {
      await this.projector.project(task, observation);
    } catch (error) {
      task = await this.tasks.update(task.id, "normalized", {
        status: "projection_failed",
        errorCode: "product_projection",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { task, observation };
    }
    task = await this.tasks.update(task.id, "normalized", { status: "completed", completedAt: new Date().toISOString() });
    return { task, observation };
  }

  private async requireTask(id: string): Promise<ProviderTaskRecord> {
    const task = await this.tasks.get(id);
    if (!task) throw new Error(`Provider task를 찾을 수 없습니다: ${id}`);
    return task;
  }
}
