import { AioDevice, AioKeywordGroup, AioRate, AioSourceType } from "@/lib/db";

export const GROUP_LABEL: Record<AioKeywordGroup, string> = {
  brand: "브랜드",
  category: "카테고리",
  comparison: "비교",
  howto: "How-to",
};

export const DEVICE_LABEL: Record<AioDevice, string> = { mobile: "모바일", desktop: "PC" };

export const COUNTRY_LABEL: Record<string, string> = { kr: "대한민국", us: "미국", jp: "일본" };
export const LANGUAGE_LABEL: Record<string, string> = { ko: "한국어", en: "영어", ja: "일본어" };

export const SOURCE_TYPE_LABEL: Record<AioSourceType, string> = {
  own_video: "YouTube · 우리 채널",
  other_youtube: "YouTube · 기타 채널",
  own_web: "자사 웹",
  competitor: "경쟁사 사이트",
  other: "블로그 · 미디어",
};

/** 0.126 → "13%", null(미측정) → "–" */
export function formatPercent(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

export function formatRate(value: AioRate): string {
  return formatPercent(value.rate);
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "2026-09-21" → "9/21" */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/**
 * ISO 시각 → "2026-09-21 09:00" (한국 시간). toLocaleString은 서버(Node)와
 * 브라우저의 ICU 출력이 달라 하이드레이션이 깨지므로 직접 만든다.
 */
export function formatKstDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${kst.toISOString().slice(0, 10)} ${kst.toISOString().slice(11, 16)}`;
}
