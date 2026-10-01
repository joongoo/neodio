import { ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getManagedBrandById } from "../brandsManagementStore";
import { getBrandAioSettings, listBrandYoutubeChannels } from "../brandAioConfig";
import { resolveYoutubeVideo } from "../youtube";
import { getPromptStore } from "../database";
import { buildJudgeContext, CollectedSource, judgeCitations } from "./judge";
import { cacheVideo, collectedToday, getCachedVideos, keywordPromptContext, listAioKeywords, saveAioObservation, seoulDate } from "./store";
import { AioCitation, AioDevice, AioObservationStatus, AioParagraph, PromptRunSeed, RawCitationMetadata, YoutubeVideoMeta } from "@/lib/db/types";

const GOOGLE_AIO_MODEL_ID = "model-google-aio";
const DEFAULT_MARKET_ID = "market-kr";

function toRawCitation(citation: AioCitation): RawCitationMetadata {
  return {
    title: citation.title,
    url: citation.url,
    domain: citation.domain,
    isOwnDomain: citation.sourceType === "own_video" || citation.sourceType === "own_web",
    position: citation.position,
    sourceType: citation.sourceType,
    videoId: citation.videoId,
    channelId: citation.channelId,
    startSeconds: citation.startSeconds,
  };
}

// 구글AIO 결과를 다른 플랫폼(네이버AI/구글AI모드)과 같은 prompt_runs에도
// 적재한다 — 수집 로그·가시성 개요·브랜드 가시성이 전부 prompt_runs만
// 보고 계산하므로, 여기에 안 들어가면 AIO는 그 화면들에 영영 안 보인다.
// aio_observations 저장은 그대로 유지한다 — YouTube AIO 전용 대시보드(영상
// 소유 판정, 채널별 통계 등)는 아직 이 테이블을 직접 쓴다.
async function syncAioRunToPromptRuns(params: {
  keywordId: string;
  device: AioDevice;
  status: AioObservationStatus;
  collectedAt: string;
  aioText?: string | null;
  citations: AioCitation[];
  screenshotPath?: string | null;
  htmlPath?: string | null;
  errorMessage?: string | null;
}) {
  try {
    const context = await keywordPromptContext(params.keywordId);
    if (!context || !context.promptId) return;
    const status: PromptRunSeed["status"] = params.status === "aio_present" ? "success" : "failed";
    const errorMessage =
      params.status === "aio_absent"
        ? "empty_aio_answer: Google did not render an AI Overview panel for this query."
        : params.status === "failed"
          ? (params.errorMessage ?? "unknown_error")
          : null;
    const run: PromptRunSeed = {
      id: `run-google-aio-${params.keywordId}-${params.device}-${Date.parse(params.collectedAt) || Date.now()}`,
      promptId: context.promptId,
      llmModelId: GOOGLE_AIO_MODEL_ID,
      marketId: DEFAULT_MARKET_ID,
      runAt: params.collectedAt,
      status,
      rawResponse: params.aioText ?? "",
      rawMetadata: {
        source: "google-aio",
        collectedBy: "google-aio-collector",
        locale: params.device,
        query: context.keyword,
        screenshotPath: params.screenshotPath ?? undefined,
        htmlPath: params.htmlPath ?? undefined,
        answerTextLength: params.aioText?.length,
        citations: params.citations.map(toRawCitation),
        errorMessage,
      },
    };
    const store = await getPromptStore();
    await store.importRun(context.organizationId, { dir: "aio-sync", filename: `${run.id}.json`, promptRun: run }, null);
  } catch (error) {
    console.error("[aio] prompt_runs 동기화 실패 — aio_observations 저장은 영향 없음:", error);
  }
}

// YouTube AIO 수집 한 회차 — 정기 수집 CLI(scripts/collect-aio.ts)와
// 화면의 "지금 수집" 버튼(aio/jobRunner.ts)이 같은 코드를 쓴다.
// 키워드 × 디바이스를 섞은 순서로 하나씩, 무작위 간격을 두고 수집한다 —
// 단일 IP로 Google을 치므로 캡차를 피하는 유일한 수단이다(Phase 0: 20~40초
// 간격은 10번째 요청에 캡차). 캡차가 뜨면 그 회차는 거기서 멈춘다.

export interface CollectorResult {
  status: AioObservationStatus;
  errorKind?: "captcha" | "error";
  errorMessage?: string;
  collectedAt: string;
  aioText?: string | null;
  paragraphs?: AioParagraph[];
  sources?: CollectedSource[];
  screenshotPath?: string;
  htmlPath?: string;
}

export type AioRunEvent =
  | { type: "plan"; total: number; skipped: number; devices: AioDevice[] }
  | { type: "start"; index: number; keyword: string; device: AioDevice }
  | { type: "wait"; ms: number }
  | {
      type: "result";
      index: number;
      keyword: string;
      device: AioDevice;
      status: AioObservationStatus;
      captcha: boolean;
      sources: number;
      youtube: number;
      ownPositions: number[];
      saved: boolean;
      message: string | null;
    };

export interface AioRunOptions {
  brandId: string;
  /** 없으면 브랜드의 활성 키워드 전체 */
  keywordIds?: string[];
  /** 없으면 브랜드 설정의 디바이스 */
  devices?: AioDevice[];
  /** true면 오늘 이미 수집한 키워드×디바이스도 다시 수집 */
  force?: boolean;
  limit?: number;
  minDelayMs: number;
  maxDelayMs: number;
  onEvent?: (event: AioRunEvent) => void;
  /** 중단 요청 여부 — 키워드 사이, 대기 중에 확인한다. */
  shouldStop?: () => boolean;
  /** 지금 돌고 있는 수집기 프로세스 — 중단 시 죽이기 위해 */
  onChild?: (child: ChildProcess | null) => void;
}

export interface AioRunSummary {
  planned: number;
  completed: number;
  captcha: boolean;
  stopped: boolean;
  /** 채널 미연동 등으로 시작하지 못한 이유 */
  skippedReason: string | null;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 중단 요청을 1초 안에 알아채도록 잘게 나눠 잔다.
async function interruptibleSleep(ms: number, shouldStop?: () => boolean) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (shouldStop?.()) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(1000, until - Date.now())));
  }
}

function runCollector(args: string[], onChild?: (child: ChildProcess | null) => void): Promise<CollectorResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts", "collect-google-aio.mjs"), ...args], { cwd: process.cwd() });
    onChild?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      onChild?.(null);
      reject(error);
    });
    child.on("close", async () => {
      onChild?.(null);
      const lastLine = stdout.trim().split("\n").pop() ?? "";
      try {
        const { outputPath } = JSON.parse(lastLine) as { outputPath: string };
        resolve(JSON.parse(await readFile(outputPath, "utf8")) as CollectorResult);
      } catch {
        reject(new Error(`수집기가 결과를 남기지 않았습니다: ${(stderr || stdout).trim().slice(0, 300) || "중단됨"}`));
      }
    });
  });
}

// 영상 → 채널 조회는 캐시 우선. 한 번 본 영상은 다시 묻지 않는다.
async function lookupVideo(videoId: string): Promise<YoutubeVideoMeta | null> {
  const cached = (await getCachedVideos([videoId])).get(videoId);
  if (cached) return cached;
  const fetched = await resolveYoutubeVideo(videoId).catch(() => null);
  if (fetched) await cacheVideo(fetched);
  return fetched;
}

export interface AioPlan {
  brand: NonNullable<Awaited<ReturnType<typeof getManagedBrandById>>>;
  channelIds: string[];
  settings: Awaited<ReturnType<typeof getBrandAioSettings>>;
  devices: AioDevice[];
  /** 섞은 순서의 수집 계획(키워드 × 디바이스) — 오늘 이미 수집한 것은 뺀 뒤 limit만큼 */
  tasks: { keyword: Awaited<ReturnType<typeof listAioKeywords>>[number]; device: AioDevice }[];
  /** 오늘 이미 수집해 건너뛴 만큼을 포함해, 계획에서 빠진 수 */
  skipped: number;
}

/**
 * 어떤 키워드 × 디바이스를 수집할지 정한다 — 서버가 직접 돌리는 수집(runAioCollection)과 사용자 PC의
 * 수집기에 맡기는 수집(/api/youtube-aio/collect의 agent 계획)이 같은 규칙을 쓴다.
 * 정기 수집 CLI처럼 조직(쿠키)을 모르는 곳에서도 돌아야 해서 브랜드 id로 찾는다.
 */
export async function planAioRun(
  options: Pick<AioRunOptions, "brandId" | "keywordIds" | "devices" | "force" | "limit">
): Promise<{ plan: AioPlan } | { skippedReason: string }> {
  const { brandId } = options;
  const brand = await getManagedBrandById(brandId);
  if (!brand) return { skippedReason: "브랜드를 찾을 수 없습니다." };
  const channels = await listBrandYoutubeChannels(brandId);
  if (channels.length === 0) return { skippedReason: "YouTube 채널이 연동되지 않았습니다." };

  const settings = await getBrandAioSettings(brandId);
  const devices = options.devices?.length ? options.devices : settings.devices;
  const keywords = (await listAioKeywords(brandId)).filter((k) => !options.keywordIds || options.keywordIds.includes(k.id));
  if (keywords.length === 0) return { skippedReason: "수집할 키워드가 없습니다." };

  const skip = options.force ? new Set<string>() : await collectedToday(brandId, seoulDate(new Date().toISOString()));
  const tasks = shuffle(keywords.flatMap((keyword) => devices.map((device) => ({ keyword, device }))))
    .filter((t) => !skip.has(`${t.keyword.id}:${t.device}`))
    .slice(0, options.limit ?? Infinity);
  return { plan: { brand, channelIds: channels.map((c) => c.channelId), settings, devices, tasks, skipped: keywords.length * devices.length - tasks.length } };
}

/** 수집 결과 한 건을 판정(자사 영상·경쟁사 등 분류)해 저장한다 — 서버가 직접 돌린 결과와 수집기가 올린 결과가 같이 쓴다. */
export async function saveCollectedResult(params: {
  brandId: string;
  keywordId: string;
  device: AioDevice;
  country: string;
  language: string;
  result: CollectorResult;
  context: ReturnType<typeof buildJudgeContext>;
}) {
  const { brandId, keywordId, device, country, language, result, context } = params;
  const citations = result.status === "aio_present" ? await judgeCitations(result.sources ?? [], context, lookupVideo) : [];
  const saved = await saveAioObservation(brandId, {
    keywordId,
    device,
    country,
    language,
    collectedAt: result.collectedAt,
    status: result.status,
    aioText: result.aioText ?? null,
    paragraphs: result.paragraphs ?? [],
    citations,
    screenshotPath: result.screenshotPath ?? null,
    htmlPath: result.htmlPath ?? null,
    errorMessage: result.errorMessage ?? null,
  });
  await syncAioRunToPromptRuns({
    keywordId,
    device,
    status: result.status,
    collectedAt: result.collectedAt,
    aioText: result.aioText,
    citations,
    screenshotPath: result.screenshotPath,
    htmlPath: result.htmlPath,
    errorMessage: result.errorMessage,
  });
  return { citations, saved };
}

export async function runAioCollection(options: AioRunOptions): Promise<AioRunSummary> {
  const { brandId, onEvent, shouldStop } = options;
  const summary: AioRunSummary = { planned: 0, completed: 0, captcha: false, stopped: false, skippedReason: null };

  const planned = await planAioRun(options);
  if ("skippedReason" in planned) return { ...summary, skippedReason: planned.skippedReason };
  const { brand, channelIds, settings, devices, tasks, skipped } = planned.plan;
  summary.planned = tasks.length;
  onEvent?.({ type: "plan", total: tasks.length, skipped, devices });

  const context = buildJudgeContext(brand, channelIds);

  for (const [index, { keyword, device }] of tasks.entries()) {
    if (shouldStop?.()) return { ...summary, stopped: true };
    if (index > 0) {
      const delay = options.minDelayMs + Math.floor(Math.random() * (options.maxDelayMs - options.minDelayMs + 1));
      onEvent?.({ type: "wait", ms: delay });
      await interruptibleSleep(delay, shouldStop);
      if (shouldStop?.()) return { ...summary, stopped: true };
    }
    onEvent?.({ type: "start", index, keyword: keyword.keyword, device });

    let result: CollectorResult;
    try {
      result = await runCollector(
        [
          "--query", keyword.keyword,
          "--device", device,
          "--country", settings.country,
          "--language", settings.language,
          // 수집기에 넘기는 출력 경로 문자열일 뿐이라 빌드 파일 추적에서 뺀다.
          "--out", path.join(/* turbopackIgnore: true */ ".tmp", "google-aio", brandId),
        ],
        options.onChild
      );
    } catch (error) {
      if (shouldStop?.()) return { ...summary, stopped: true };
      onEvent?.({
        type: "result",
        index,
        keyword: keyword.keyword,
        device,
        status: "failed",
        captcha: false,
        sources: 0,
        youtube: 0,
        ownPositions: [],
        saved: false,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const { citations, saved } = await saveCollectedResult({
      brandId,
      keywordId: keyword.id,
      device,
      country: settings.country,
      language: settings.language,
      result,
      context,
    });
    summary.completed += 1;

    const captcha = result.errorKind === "captcha";
    onEvent?.({
      type: "result",
      index,
      keyword: keyword.keyword,
      device,
      status: result.status,
      captcha,
      sources: citations.length,
      youtube: citations.filter((c) => c.sourceType === "own_video" || c.sourceType === "other_youtube").length,
      ownPositions: citations.filter((c) => c.sourceType === "own_video").map((c) => c.position),
      saved: saved !== null,
      message: result.errorMessage ?? null,
    });
    if (captcha) return { ...summary, captcha: true };
  }
  return summary;
}
