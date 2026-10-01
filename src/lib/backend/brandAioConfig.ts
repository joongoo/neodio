import { getPromptStore } from "./database";
import { AioDevice, BrandAioSettings, BrandYoutubeChannel } from "@/lib/db/types";
import { YoutubeChannelInfo } from "./youtube";

// 브랜드별 YouTube 채널 + AIO 수집 조건 — 브랜드 관리 > 연결 관리에서
// 등록하고, YouTube AIO 인용 페이지와 AIO 수집기가 읽는다.

export const DEFAULT_AIO_SETTINGS: BrandAioSettings = {
  country: "kr",
  language: "ko",
  devices: ["mobile", "desktop"],
  optimizationDate: null,
  saved: false,
};

const DEVICES: AioDevice[] = ["mobile", "desktop"];

export async function listBrandYoutubeChannels(brandId: string): Promise<BrandYoutubeChannel[]> {
  const rows = await (await getPromptStore()).query<{
    channel_id: string;
    handle: string | null;
    title: string;
    thumbnail_url: string | null;
    added_at: string;
  }>("SELECT channel_id,handle,title,thumbnail_url,added_at FROM brand_youtube_channels WHERE brand_id=$1 ORDER BY added_at", [brandId]);
  return rows.map((row) => ({
    channelId: row.channel_id,
    handle: row.handle,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    addedAt: row.added_at,
  }));
}

export async function addBrandYoutubeChannel(brandId: string, channel: YoutubeChannelInfo): Promise<void> {
  await (await getPromptStore()).query(
    `INSERT INTO brand_youtube_channels VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (brand_id,channel_id) DO UPDATE SET handle=EXCLUDED.handle,title=EXCLUDED.title,thumbnail_url=EXCLUDED.thumbnail_url`,
    [brandId, channel.channelId, channel.handle, channel.title, channel.thumbnailUrl, new Date().toISOString()]
  );
}

export async function removeBrandYoutubeChannel(brandId: string, channelId: string): Promise<void> {
  await (await getPromptStore()).query("DELETE FROM brand_youtube_channels WHERE brand_id=$1 AND channel_id=$2", [brandId, channelId]);
}

export async function getBrandAioSettings(brandId: string): Promise<BrandAioSettings> {
  const [row] = await (await getPromptStore()).query<{
    country: string;
    language: string;
    devices_json: AioDevice[];
    optimization_date: string | null;
  }>("SELECT country,language,devices_json,optimization_date FROM brand_aio_settings WHERE brand_id=$1", [brandId]);
  if (!row) return DEFAULT_AIO_SETTINGS;
  return {
    country: row.country,
    language: row.language,
    devices: row.devices_json,
    optimizationDate: row.optimization_date,
    saved: true,
  };
}

/** 입력 검증 — 통과하면 저장할 값, 아니면 사용자에게 보여줄 오류 문구. */
export function validateAioSettings(input: unknown): Omit<BrandAioSettings, "saved"> | string {
  if (!input || typeof input !== "object") return "잘못된 요청입니다.";
  const body = input as Record<string, unknown>;
  const country = typeof body.country === "string" ? body.country.trim().toLowerCase() : "";
  const language = typeof body.language === "string" ? body.language.trim().toLowerCase() : "";
  if (!/^[a-z]{2}$/.test(country)) return "국가 코드는 2자리 영문(예: kr, us)이어야 합니다.";
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(language)) return "언어 코드는 ko, en 같은 형식이어야 합니다.";
  const devices = Array.isArray(body.devices) ? body.devices.filter((d): d is AioDevice => DEVICES.includes(d as AioDevice)) : [];
  if (devices.length === 0) return "디바이스를 하나 이상 선택하세요.";
  const optimizationDate = typeof body.optimizationDate === "string" && body.optimizationDate ? body.optimizationDate : null;
  if (optimizationDate && !/^\d{4}-\d{2}-\d{2}$/.test(optimizationDate)) return "최적화 기준일 형식이 올바르지 않습니다.";
  return { country, language, devices: [...new Set(devices)], optimizationDate };
}

export async function saveBrandAioSettings(brandId: string, settings: Omit<BrandAioSettings, "saved">): Promise<void> {
  await (await getPromptStore()).query(
    `INSERT INTO brand_aio_settings VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (brand_id) DO UPDATE SET country=EXCLUDED.country,language=EXCLUDED.language,
       devices_json=EXCLUDED.devices_json,optimization_date=EXCLUDED.optimization_date,updated_at=EXCLUDED.updated_at`,
    [brandId, settings.country, settings.language, JSON.stringify(settings.devices), settings.optimizationDate, new Date().toISOString()]
  );
}
