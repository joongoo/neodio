import { getCurrentTenant } from "../tenant";
import { getBrandAioSettings, listBrandYoutubeChannels } from "../brandAioConfig";
import { listPromptLibrary } from "../trackedTopics";
import { addDays } from "./metrics";
import { hasMeasurementSince, seoulDate, videoCitationSummaries, videoKeywordCitations } from "./store";
import { listManagedVideos, videoPromptRows } from "./videoManage";
import { buildDemoAioData } from "@/lib/db/data/youtubeAio";
import { AioDevice, BrandAioSettings, ManagedVideo, VideoKeywordCitation, VideoPromptRow } from "@/lib/db/types";
import { RECENT_DAYS } from "@/lib/videoManage";
import type { AioSetupState } from "./pageData";

// YouTube 관리 화면(영상 목록·영상 상세)의 서버 데이터. 채널이 연결되지 않은 브랜드는 { kind: "setup" }을 돌려
// 페이지가 브랜드 관리의 연결 화면으로 안내하게 한다(YouTube AIO 인용과 같은 전제).

export interface VideoManageRow extends ManagedVideo {
  /** 연결된 채널의 영상인지 — 다른 채널 영상을 직접 등록해 둔 경우 배지를 붙인다. */
  ownChannel: boolean;
  /** 최근 RECENT_DAYS일 안에 Google AIO가 이 영상을 인용한 프롬프트 수. 그 기간에 수집이 없었으면 null("–"). */
  recentCitingPrompts: number | null;
  lastCitedDate: string | null;
}

export interface VideoManageListData {
  kind: "ready";
  base: string;
  demo: boolean;
  brandId: string;
  brandName: string;
  industry: string;
  settings: BrandAioSettings;
  device: AioDevice;
  videos: VideoManageRow[];
  /** 브랜드가 이미 추적 중인 프롬프트 문장 — 예상 프롬프트를 만들 때 겹치지 않게 한다. */
  existingPrompts: string[];
  /** 서버에 YouTube API 키가 있어야 채널 영상을 가져올 수 있다. */
  canSync: boolean;
}

export interface VideoManageDetailData {
  kind: "ready";
  base: string;
  demo: boolean;
  brandId: string;
  brandName: string;
  industry: string;
  existingPrompts: string[];
  device: AioDevice;
  devices: AioDevice[];
  video: VideoManageRow;
  /** 이 영상용으로 만든 예상 프롬프트 */
  prompts: VideoPromptRow[];
  /** Google AIO가 이 영상을 인용한 프롬프트(영상용으로 만들지 않은 것 포함) */
  citedBy: VideoKeywordCitation[];
  /** 최근 RECENT_DAYS일 안에 이 디바이스로 성공한 AIO 수집이 있었는지 */
  measured: boolean;
}

export type VideoManageNotFound = { kind: "not_found" };

async function loadBase(requestedDevice: string | undefined) {
  const tenant = await getCurrentTenant();
  const today = seoulDate(new Date().toISOString());
  if (tenant.demo) {
    const demo = buildDemoAioData(today);
    const device = demo.settings.devices.includes(requestedDevice as AioDevice) ? (requestedDevice as AioDevice) : demo.settings.devices[0] ?? "mobile";
    const videos: VideoManageRow[] = Object.values(demo.videos).map((v, i) => ({
      ...v, addedAt: today, checked: i % 2 === 0, promptCount: 0, ownChannel: true, recentCitingPrompts: null, lastCitedDate: null,
    }));
    return { kind: "demo" as const, tenant, today, settings: demo.settings, device, videos };
  }
  const brand = tenant.brand;
  if (!brand) return { kind: "setup" as const, state: { kind: "setup", brandId: null, brandName: null, base: tenant.base } satisfies AioSetupState };
  const channels = await listBrandYoutubeChannels(brand.id);
  if (channels.length === 0) return { kind: "setup" as const, state: { kind: "setup", brandId: brand.id, brandName: brand.name, base: tenant.base } satisfies AioSetupState };
  const settings = await getBrandAioSettings(brand.id);
  const device = settings.devices.includes(requestedDevice as AioDevice) ? (requestedDevice as AioDevice) : settings.devices[0] ?? "mobile";
  const since = addDays(today, -RECENT_DAYS);
  const [managed, measured] = await Promise.all([listManagedVideos(brand.id), hasMeasurementSince(brand.id, device, since)]);
  const summaries = await videoCitationSummaries(brand.id, managed.map((v) => v.videoId), device, since);
  const ownChannelIds = new Set(channels.map((c) => c.channelId));
  const videos: VideoManageRow[] = managed.map((v) => {
    const summary = summaries.get(v.videoId);
    return {
      ...v,
      ownChannel: ownChannelIds.has(v.channelId),
      recentCitingPrompts: measured ? (summary?.recentKeywords ?? 0) : null,
      lastCitedDate: summary?.lastCitedDate ?? null,
    };
  });
  return { kind: "live" as const, tenant, brand, today, settings, device, videos, measured };
}

export async function loadVideoManageList(params: { device?: string }): Promise<VideoManageListData | AioSetupState> {
  const ctx = await loadBase(params.device);
  if (ctx.kind === "setup") return ctx.state;
  const base = {
    kind: "ready" as const,
    base: ctx.tenant.base,
    settings: ctx.settings,
    device: ctx.device,
    videos: ctx.videos,
    canSync: Boolean(process.env.YOUTUBE_API_KEY),
  };
  if (ctx.kind === "demo") return { ...base, demo: true, brandId: "demo", brandName: "Demo", industry: "", existingPrompts: [] };
  const library = await listPromptLibrary(ctx.tenant.orgId, ctx.brand.id);
  return {
    ...base,
    demo: false,
    brandId: ctx.brand.id,
    brandName: ctx.brand.name,
    industry: ctx.brand.industry ?? "",
    existingPrompts: library.map((row) => row.prompt),
  };
}

export async function loadVideoManageDetail(videoId: string, params: { device?: string }): Promise<VideoManageDetailData | AioSetupState | VideoManageNotFound> {
  const ctx = await loadBase(params.device);
  if (ctx.kind === "setup") return ctx.state;
  const video = ctx.videos.find((v) => v.videoId === videoId);
  if (!video) return { kind: "not_found" };
  const common = { kind: "ready" as const, base: ctx.tenant.base, device: ctx.device, devices: ctx.settings.devices, video };
  if (ctx.kind === "demo") {
    return { ...common, demo: true, brandId: "demo", brandName: "Demo", industry: "", existingPrompts: [], prompts: [], citedBy: [], measured: false };
  }
  const [prompts, citedBy, library] = await Promise.all([
    videoPromptRows(ctx.brand.id, videoId, ctx.device),
    videoKeywordCitations(ctx.brand.id, videoId, ctx.device),
    listPromptLibrary(ctx.tenant.orgId, ctx.brand.id),
  ]);
  return {
    ...common,
    demo: false,
    brandId: ctx.brand.id,
    brandName: ctx.brand.name,
    industry: ctx.brand.industry ?? "",
    existingPrompts: library.map((row) => row.prompt),
    prompts,
    citedBy,
    measured: ctx.measured,
  };
}
