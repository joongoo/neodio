import { BrandYoutubeChannel, SocialAccount } from "@/lib/db/types";

// 브랜드 설정의 "소셜 계정"과 YouTube AIO 인용 판정용 채널
// (brand_youtube_channels)을 짝짓는 규칙 — 서버(채널 API)와 화면(소셜 계정
// 목록)이 같은 기준을 쓴다. 소셜 계정은 사람이 적은 자유 텍스트라
// "@핸들"이나 "UC…" 채널 ID를 뽑아 대조한다.

export function isYoutubeSocial(account: SocialAccount): boolean {
  return /youtube|유튜브/i.test(account.platform) || /youtube\.com|youtu\.be/i.test(account.handle);
}

/** "@salesforce", "youtube.com/@salesforce/videos", "UC…", ".../channel/UC…" → 비교용 키 */
export function youtubeSocialKeys(value: string): string[] {
  const keys: string[] = [];
  const handle = value.match(/@[\w.\-가-힣]+/)?.[0];
  if (handle) keys.push(handle.toLowerCase());
  const channelId = value.match(/UC[\w-]{22}/)?.[0];
  if (channelId) keys.push(channelId);
  return keys;
}

export function findChannelForSocial(account: SocialAccount, channels: BrandYoutubeChannel[]): BrandYoutubeChannel | null {
  if (!isYoutubeSocial(account)) return null;
  const keys = youtubeSocialKeys(account.handle);
  return channels.find((c) => keys.includes(c.channelId) || (c.handle !== null && keys.includes(c.handle.toLowerCase()))) ?? null;
}

/** 채널을 소셜 계정 목록에 넣을 때의 표기 */
export function socialForChannel(channel: Pick<BrandYoutubeChannel, "channelId" | "handle">): SocialAccount {
  return { platform: "YouTube", handle: channel.handle ?? `https://www.youtube.com/channel/${channel.channelId}` };
}
