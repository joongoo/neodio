import { getCurrentTenant } from "../tenant";
import { getBrandAioSettings, listBrandYoutubeChannels } from "../brandAioConfig";
import { addDays, buildAioOverview, buildHistory, retention } from "./metrics";
import { firstOwnCitationDates, getCachedVideos, listAioKeywords, listAioObservations, listWorkLogs, seoulDate } from "./store";
import { buildDemoAioData } from "@/lib/db/data/youtubeAio";
import {
  AioCitation,
  AioDevice,
  AioHistoryState,
  AioKeyword,
  AioKeywordGroup,
  AioObservation,
  AioOverview,
  AioRate,
  AioVideoWorkLog,
  BrandAioSettings,
  DateRange,
  YoutubeVideoMeta,
} from "@/lib/db/types";

// YouTube AIO 인용 페이지(전체 현황·키워드 상세)의 서버 데이터 — 선택
// 브랜드 기준, "Demo"면 샘플. 연동 전이면 { kind: "setup" }을 돌려 페이지가
// 연결 관리로 안내하게 한다.

// 기간은 다른 화면(개요·가시성 개요)과 같은 DateRange(1w/2w/4w, 기본 4w).
const RANGE_WEEKS: Record<DateRange, number> = { "1w": 1, "2w": 2, "4w": 4 };

export type AioSetupState = { kind: "setup"; brandId: string | null; brandName: string | null; base: string };

interface Context {
  /** /{조직}/{브랜드} — 화면 안 링크의 앞부분 */
  base: string;
  demo: boolean;
  brandId: string;
  brandName: string;
  settings: BrandAioSettings;
  today: string;
  keywords: AioKeyword[];
  loadObservations: (fromDate: string, keywordId?: string) => Promise<AioObservation[]>;
  loadVideos: (ids: string[]) => Promise<Map<string, YoutubeVideoMeta>>;
  loadWorkLogs: (videoIds: string[]) => Promise<AioVideoWorkLog[]>;
  loadFirstCitations: (videoIds: string[]) => Promise<Map<string, string>>;
}

async function loadContext(): Promise<Context | AioSetupState> {
  const today = seoulDate(new Date().toISOString());
  const tenant = await getCurrentTenant();
  if (tenant.demo) {
    const demo = buildDemoAioData(today);
    return {
      base: tenant.base,
      demo: true,
      brandId: "demo",
      brandName: "Demo",
      settings: demo.settings,
      today,
      keywords: demo.keywords,
      loadObservations: async (fromDate, keywordId) =>
        demo.observations.filter((o) => o.collectedDate >= fromDate && (!keywordId || o.keywordId === keywordId)),
      loadVideos: async (ids) => new Map(ids.filter((id) => demo.videos[id]).map((id) => [id, demo.videos[id]])),
      loadWorkLogs: async (videoIds) => demo.workLogs.filter((log) => videoIds.includes(log.videoId)),
      loadFirstCitations: async (videoIds) => {
        const first = new Map<string, string>();
        for (const o of demo.observations) {
          for (const c of o.citations) {
            if (c.sourceType !== "own_video" || !c.videoId || !videoIds.includes(c.videoId)) continue;
            const current = first.get(c.videoId);
            if (!current || o.collectedDate < current) first.set(c.videoId, o.collectedDate);
          }
        }
        return first;
      },
    };
  }

  const brand = tenant.brand;
  if (!brand) return { kind: "setup", brandId: null, brandName: null, base: tenant.base };
  const channels = await listBrandYoutubeChannels(brand.id);
  if (channels.length === 0) return { kind: "setup", brandId: brand.id, brandName: brand.name, base: tenant.base };
  const [settings, keywords] = await Promise.all([getBrandAioSettings(brand.id), listAioKeywords(brand.id)]);
  return {
    base: tenant.base,
    demo: false,
    brandId: brand.id,
    brandName: brand.name,
    settings,
    today,
    keywords,
    loadObservations: (fromDate, keywordId) => listAioObservations(brand.id, { fromDate, toDate: today, keywordId }),
    loadVideos: getCachedVideos,
    loadWorkLogs: (videoIds) => listWorkLogs(brand.id, videoIds),
    loadFirstCitations: (videoIds) => firstOwnCitationDates(brand.id, videoIds),
  };
}

function pickDevice(settings: BrandAioSettings, requested: string | undefined): AioDevice {
  return settings.devices.includes(requested as AioDevice) ? (requested as AioDevice) : settings.devices[0] ?? "mobile";
}

export interface AioOverviewPageData {
  kind: "ready";
  base: string;
  demo: boolean;
  brandId: string;
  brandName: string;
  settings: BrandAioSettings;
  device: AioDevice;
  group: AioKeywordGroup | "all";
  range: DateRange;
  /** 비교 기준일(최적화 적용일). 설정값이 기본, URL로 바꿀 수 있다. */
  baseDate: string | null;
  totalKeywords: number;
  overview: AioOverview;
}

export async function loadAioOverviewPage(params: {
  range?: string;
  device?: string;
  group?: string;
  base?: string;
}): Promise<AioOverviewPageData | AioSetupState> {
  const ctx = await loadContext();
  if ("kind" in ctx) return ctx;

  const range: DateRange = params.range && params.range in RANGE_WEEKS ? (params.range as DateRange) : "4w";
  const weeks = RANGE_WEEKS[range];
  const device = pickDevice(ctx.settings, params.device);
  const group = (["brand", "category", "comparison", "howto"] as const).find((g) => g === params.group) ?? "all";
  const baseDate = params.base === "none" ? null : params.base && /^\d{4}-\d{2}-\d{2}$/.test(params.base) ? params.base : ctx.settings.optimizationDate;

  const keywords = ctx.keywords.filter((k) => group === "all" || k.group === group);
  // 7일 변화 계산을 위해 기간보다 1주 더 읽는다.
  const observations = (await ctx.loadObservations(addDays(ctx.today, -(weeks + 1) * 7))).filter((o) => o.device === device);
  const overview = buildAioOverview({ keywords, observations, today: ctx.today, weeks, optimizationDate: baseDate });

  return {
    kind: "ready",
    base: ctx.base,
    demo: ctx.demo,
    brandId: ctx.brandId,
    brandName: ctx.brandName,
    settings: ctx.settings,
    device,
    group,
    range,
    baseDate,
    totalKeywords: ctx.keywords.length,
    overview,
  };
}

export interface AioOwnVideoDetail {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  startSeconds: number | null;
  position: number;
  firstCitedDate: string | null;
  workLogs: AioVideoWorkLog[];
  otherKeywords: { id: string; keyword: string }[];
}

export interface AioKeywordDetailPageData {
  kind: "ready";
  base: string;
  demo: boolean;
  brandId: string;
  settings: BrandAioSettings;
  device: AioDevice;
  keyword: AioKeyword;
  latest: AioObservation | null;
  citations: (AioCitation & { thumbnailUrl: string | null })[];
  history: { date: string; state: AioHistoryState }[];
  retention: AioRate;
  ownVideos: AioOwnVideoDetail[];
}

const HISTORY_DAYS = 14;
const REVERSE_LOOKUP_DAYS = 30;

export async function loadAioKeywordDetailPage(
  keywordId: string,
  params: { device?: string }
): Promise<AioKeywordDetailPageData | AioSetupState | { kind: "not_found" }> {
  const ctx = await loadContext();
  if ("kind" in ctx) return ctx;
  const keyword = ctx.keywords.find((k) => k.id === keywordId);
  if (!keyword) return { kind: "not_found" };

  const device = pickDevice(ctx.settings, params.device);
  // 역추적("이 영상이 인용되는 다른 키워드")을 위해 브랜드 전체 최근 30일을 읽는다.
  const recent = (await ctx.loadObservations(addDays(ctx.today, -REVERSE_LOOKUP_DAYS))).filter((o) => o.device === device);
  const mine = recent.filter((o) => o.keywordId === keywordId);
  const latest = [...mine].filter((o) => o.status !== "failed").sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0] ?? null;
  const history = buildHistory(mine, ctx.today, HISTORY_DAYS);

  const citationsNow = latest?.citations ?? [];
  const videoIds = [...new Set(citationsNow.map((c) => c.videoId).filter((id): id is string => !!id))];
  const ownNow = citationsNow.filter((c) => c.sourceType === "own_video" && c.videoId);
  const ownIds = [...new Set(ownNow.map((c) => c.videoId as string))];
  const [videos, workLogs, firstCited] = await Promise.all([ctx.loadVideos(videoIds), ctx.loadWorkLogs(ownIds), ctx.loadFirstCitations(ownIds)]);

  const keywordName = new Map(ctx.keywords.map((k) => [k.id, k.keyword]));
  const ownVideos: AioOwnVideoDetail[] = ownIds.map((videoId) => {
    const citation = ownNow.find((c) => c.videoId === videoId)!;
    const otherKeywordIds = new Set(
      recent
        .filter((o) => o.keywordId !== keywordId && o.citations.some((c) => c.sourceType === "own_video" && c.videoId === videoId))
        .map((o) => o.keywordId)
    );
    return {
      videoId,
      title: videos.get(videoId)?.title ?? citation.title,
      thumbnailUrl: videos.get(videoId)?.thumbnailUrl || null,
      startSeconds: citation.startSeconds,
      position: citation.position,
      firstCitedDate: firstCited.get(videoId) ?? null,
      workLogs: workLogs.filter((log) => log.videoId === videoId),
      otherKeywords: [...otherKeywordIds]
        .filter((id) => keywordName.has(id))
        .map((id) => ({ id, keyword: keywordName.get(id)! })),
    };
  });

  return {
    kind: "ready",
    base: ctx.base,
    demo: ctx.demo,
    brandId: ctx.brandId,
    settings: ctx.settings,
    device,
    keyword,
    latest,
    citations: citationsNow.map((c) => ({ ...c, thumbnailUrl: c.videoId ? videos.get(c.videoId)?.thumbnailUrl || null : null })),
    history,
    retention: retention(history.slice(-7)),
    ownVideos,
  };
}
