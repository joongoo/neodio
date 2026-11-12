import type { DataForSeoApiResponse, DataForSeoApiTask } from "./types";

const API_ORIGIN = "https://api.dataforseo.com";
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class DataForSeoDisabledError extends Error {
  constructor() {
    super("DataForSEO 운영 호출이 비활성화되어 있습니다. DATAFORSEO_ENABLED=true가 필요합니다.");
    this.name = "DataForSeoDisabledError";
  }
}

export class DataForSeoRequestError extends Error {
  constructor(
    message: string,
    readonly kind: "configuration" | "network" | "http" | "invalid_response" | "provider",
    readonly submissionMayHaveSucceeded = false,
  ) {
    super(message);
    this.name = "DataForSeoRequestError";
  }
}

export interface DataForSeoClientOptions {
  login?: string;
  password?: string;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export class DataForSeoClient {
  private readonly login: string;
  private readonly password: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: DataForSeoClientOptions = {}) {
    this.login = options.login ?? process.env.DATAFORSEO_LOGIN ?? "";
    this.password = options.password ?? process.env.DATAFORSEO_PASSWORD ?? "";
    this.enabled = options.enabled ?? process.env.DATAFORSEO_ENABLED === "true";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  assertReady(): void {
    if (!this.enabled) throw new DataForSeoDisabledError();
    if (!this.login || !this.password) {
      throw new DataForSeoRequestError("DATAFORSEO_LOGIN과 DATAFORSEO_PASSWORD가 필요합니다.", "configuration");
    }
  }

  postTasks(pathname: string, tasks: Record<string, unknown>[]): Promise<DataForSeoApiResponse> {
    if (tasks.length !== 1) throw new DataForSeoRequestError("한 번의 운영 제출에는 task 1건만 허용합니다.", "configuration");
    return this.request(pathname, { method: "POST", body: JSON.stringify(tasks) }, true);
  }

  get(pathname: string): Promise<DataForSeoApiResponse> {
    return this.request(pathname, { method: "GET" }, false);
  }

  private async request(pathname: string, init: RequestInit, isSubmission: boolean): Promise<DataForSeoApiResponse> {
    this.assertReady();

    let response: Response;
    try {
      response = await this.fetchImpl(`${API_ORIGIN}${pathname}`, {
        ...init,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.login}:${this.password}`, "utf8").toString("base64")}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new DataForSeoRequestError(
        `DataForSEO 네트워크 오류: ${error instanceof Error ? error.message : String(error)}`,
        "network",
        isSubmission,
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.maxResponseBytes) {
      throw new DataForSeoRequestError(`DataForSEO 응답이 제한(${this.maxResponseBytes} bytes)을 초과했습니다.`, "invalid_response", isSubmission);
    }
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > this.maxResponseBytes) {
      throw new DataForSeoRequestError(`DataForSEO 응답이 제한(${this.maxResponseBytes} bytes)을 초과했습니다.`, "invalid_response", isSubmission);
    }

    let json: DataForSeoApiResponse;
    try {
      json = JSON.parse(body) as DataForSeoApiResponse;
    } catch {
      throw new DataForSeoRequestError(`DataForSEO가 JSON이 아닌 응답을 반환했습니다 (HTTP ${response.status}).`, "invalid_response", isSubmission);
    }
    if (!response.ok) {
      throw new DataForSeoRequestError(`DataForSEO HTTP ${response.status}: ${json.status_message ?? "unknown error"}`, "http", isSubmission);
    }
    if (json.status_code !== 20000) {
      throw new DataForSeoRequestError(`DataForSEO 요청 실패 ${json.status_code}: ${json.status_message ?? "unknown error"}`, "provider", isSubmission);
    }
    return json;
  }
}

export function firstApiTask(response: DataForSeoApiResponse): DataForSeoApiTask {
  const task = response.tasks?.[0];
  if (!task) throw new DataForSeoRequestError("DataForSEO 응답에 task가 없습니다.", "invalid_response");
  return task;
}

export function acceptedApiTask(response: DataForSeoApiResponse): DataForSeoApiTask & { id: string } {
  const task = firstApiTask(response);
  if (!task.id || Number(task.status_code) >= 40000) {
    throw new DataForSeoRequestError(`DataForSEO task 제출 실패 ${task.status_code}: ${task.status_message ?? "unknown error"}`, "provider", true);
  }
  return task as DataForSeoApiTask & { id: string };
}

const PENDING_CODES = new Set([20100, 40601, 40602]);
export function apiTaskPending(task: DataForSeoApiTask): boolean {
  return PENDING_CODES.has(Number(task.status_code)) || (!Array.isArray(task.result) && Number(task.status_code) < 40000);
}
export function apiTaskComplete(task: DataForSeoApiTask): boolean {
  return Number(task.status_code) === 20000 && Array.isArray(task.result);
}
export function apiTaskFailed(task: DataForSeoApiTask): boolean {
  return Number(task.status_code) >= 40000 && !PENDING_CODES.has(Number(task.status_code));
}
