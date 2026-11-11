const API_ORIGIN = "https://api.dataforseo.com";

export class DataForSeoClient {
  constructor({ login, password, fetchImpl = fetch }) {
    if (!login || !password) {
      throw new Error("DATAFORSEO_LOGIN과 DATAFORSEO_PASSWORD가 필요합니다.");
    }
    this.fetchImpl = fetchImpl;
    this.authorization = `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`;
  }

  async post(pathname, payload) {
    return this.#request(pathname, { method: "POST", body: JSON.stringify(payload) });
  }

  async get(pathname) {
    return this.#request(pathname, { method: "GET" });
  }

  async #request(pathname, init) {
    const response = await this.fetchImpl(`${API_ORIGIN}${pathname}`, {
      ...init,
      headers: {
        authorization: this.authorization,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`DataForSEO가 JSON이 아닌 응답을 반환했습니다 (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new Error(`DataForSEO HTTP ${response.status}: ${json.status_message ?? "unknown error"}`);
    }
    return json;
  }
}

export function firstTask(response) {
  const task = response?.tasks?.[0];
  if (!task) throw new Error("DataForSEO 응답에 task가 없습니다.");
  return task;
}

export function assertTaskAccepted(response) {
  if (response?.status_code !== 20000) {
    throw new Error(`DataForSEO 요청 실패 ${response?.status_code}: ${response?.status_message}`);
  }
  const task = firstTask(response);
  if (task.status_code >= 40000 || !task.id) {
    throw new Error(`DataForSEO task 제출 실패 ${task.status_code}: ${task.status_message}`);
  }
  return task;
}

const PENDING_STATUS_CODES = new Set([20100, 40601, 40602]);
const COMPLETED_STATUS_CODES = new Set([20000, 40106]);

export function isTaskPending(task) {
  return PENDING_STATUS_CODES.has(task?.status_code) || (!Array.isArray(task?.result) && task?.status_code < 40000);
}

export function isTaskComplete(task) {
  return COMPLETED_STATUS_CODES.has(task?.status_code) && Array.isArray(task?.result);
}

export function isTaskFailure(task) {
  return Number(task?.status_code) >= 40000 && !PENDING_STATUS_CODES.has(task.status_code) && !COMPLETED_STATUS_CODES.has(task.status_code);
}
