import { AioCitation, AioSourceType, ManagedBrand, YoutubeVideoMeta } from "@/lib/db/types";
import { parseYoutubeVideoUrl } from "../youtube";

// AIO 인용 판정 — 수집기(scripts/collect-google-aio.mjs)가 리다이렉트를
// 풀어 둔 출처 목록을 5분류로 나눈다. 우리 영상 여부는 도메인이 아니라
// 채널 ID로 판정한다(docs/youtube-aio-tracker-plan.md §1).

export interface CollectedSource {
  position: number;
  title: string;
  url: string;
  domain: string;
}

export interface JudgeContext {
  ownChannelIds: Set<string>;
  /** 자사 웹 도메인 (www. 제외) — 기본 URL + 브랜드 URL */
  ownDomains: string[];
  /** 경쟁사 이름/별칭에서 뽑은 도메인 라벨 후보 (예: "hubspot") */
  competitorTokens: string[];
}

function normalizeHost(value: string): string {
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

// 경쟁사는 이름만 등록돼 있고 도메인이 없다 — 영문 이름/별칭을 도메인
// 라벨로 보고(hubspot → hubspot.com, blog.hubspot.com) 대조한다. 한글
// 표기는 도메인과 대조할 수 없어 제외.
function competitorToken(name: string): string | null {
  const token = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return token.length >= 3 ? token : null;
}

export function buildJudgeContext(brand: Pick<ManagedBrand, "url" | "urls" | "otherBrands">, channelIds: string[]): JudgeContext {
  const ownDomains = [...new Set([brand.url, ...brand.urls].map(normalizeHost).filter(Boolean))];
  const competitorTokens = [
    ...new Set(brand.otherBrands.flatMap((other) => [other.name, ...other.aliases]).map(competitorToken).filter((t): t is string => !!t)),
  ];
  return { ownChannelIds: new Set(channelIds), ownDomains, competitorTokens };
}

export function classifyWebSource(domain: string, context: JudgeContext): Exclude<AioSourceType, "own_video" | "other_youtube"> {
  const host = normalizeHost(domain);
  if (!host) return "other";
  if (context.ownDomains.some((own) => hostMatches(host, own))) return "own_web";
  // 서브도메인·TLD를 뺀 라벨들 중 하나라도 경쟁사 토큰과 같으면 경쟁사.
  const labels = host.split(".").slice(0, -1).map((label) => label.replace(/-/g, ""));
  if (context.competitorTokens.some((token) => labels.includes(token))) return "competitor";
  return "other";
}

export async function judgeCitations(
  sources: CollectedSource[],
  context: JudgeContext,
  lookupVideo: (videoId: string) => Promise<YoutubeVideoMeta | null>
): Promise<AioCitation[]> {
  const citations: AioCitation[] = [];
  for (const source of sources) {
    const video = parseYoutubeVideoUrl(source.url);
    if (video) {
      const meta = await lookupVideo(video.videoId);
      const channelId = meta?.channelId ?? null;
      citations.push({
        position: source.position,
        url: source.url,
        domain: source.domain,
        // AIO가 준 제목("YouTube · 채널", "…님이 YouTube에 게시한 …")보다 실제 영상 제목이 낫다.
        title: meta?.title ?? source.title,
        sourceType: channelId && context.ownChannelIds.has(channelId) ? "own_video" : "other_youtube",
        videoId: video.videoId,
        channelId,
        startSeconds: video.startSeconds,
      });
      continue;
    }
    citations.push({
      position: source.position,
      url: source.url,
      domain: source.domain,
      title: source.title || source.domain,
      sourceType: classifyWebSource(source.domain, context),
      videoId: null,
      channelId: null,
      startSeconds: null,
    });
  }
  return citations;
}
