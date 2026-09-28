import {
  AioCitation,
  AioKeyword,
  AioKeywordGroup,
  AioObservation,
  AioParagraph,
  AioVideoWorkLog,
  BrandAioSettings,
  BrandYoutubeChannel,
  YoutubeVideoMeta,
} from "../types";

// "Demo" 브랜드용 YouTube AIO 인용 샘플 — 요구사항 시안(AIO 인용 트래커
// 대시보드 1.pdf 2·3p)의 예시를 날짜만 오늘 기준으로 옮겨 재현한다. 수치를
// 박아 두지 않고 관측 원본을 만들어 실데이터와 같은 지표 계산
// (backend/aio/metrics.ts)을 거치게 한다.

const DAYS = 84;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const SF_CHANNEL = "UCdemoSalesforceChannel";

export const demoAioChannels: BrandYoutubeChannel[] = [
  { channelId: SF_CHANNEL, handle: "@salesforce", title: "Salesforce", thumbnailUrl: null, addedAt: "2026-08-01T00:00:00.000Z" },
];

const VIDEOS: Record<string, YoutubeVideoMeta> = {
  demoSlack01: { videoId: "demoSlack01", channelId: SF_CHANNEL, title: "[예시] Slack–Salesforce 연동 가이드", thumbnailUrl: "" },
  demoAgent01: { videoId: "demoAgent01", channelId: SF_CHANNEL, title: "[예시] Agentforce 3분 소개", thumbnailUrl: "" },
  demoPipe001: { videoId: "demoPipe001", channelId: SF_CHANNEL, title: "[예시] 파이프라인 관리 데모", thumbnailUrl: "" },
  demoOther01: { videoId: "demoOther01", channelId: "UCdemoOtherChannel0001", title: "[예시] 타 채널 CRM 강의 영상", thumbnailUrl: "" },
  demoOther02: { videoId: "demoOther02", channelId: "UCdemoOtherChannel0002", title: "[예시] 경쟁사 채널 CRM 비교 영상", thumbnailUrl: "" },
  demoOther03: { videoId: "demoOther03", channelId: "UCdemoOtherChannel0003", title: "[예시] 타 채널 튜토리얼 영상", thumbnailUrl: "" },
};

export const demoAioVideos = VIDEOS;

const own = (position: number, videoId: string, startSeconds: number): AioCitation => ({
  position,
  url: `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}`,
  domain: "youtube.com",
  title: VIDEOS[videoId].title,
  sourceType: "own_video",
  videoId,
  channelId: SF_CHANNEL,
  startSeconds,
});
const otherVideo = (position: number, videoId: string): AioCitation => ({
  position,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  domain: "youtube.com",
  title: VIDEOS[videoId].title,
  sourceType: "other_youtube",
  videoId,
  channelId: VIDEOS[videoId].channelId,
  startSeconds: null,
});
const web = (position: number, sourceType: AioCitation["sourceType"], domain: string, title: string): AioCitation => ({
  position,
  url: `https://${domain}/`,
  domain,
  title,
  sourceType,
  videoId: null,
  channelId: null,
  startSeconds: null,
});
const salesforceHelp = (p: number) => web(p, "own_web", "help.salesforce.com", "salesforce.com · 도움말 문서");
const blog = (p: number, n: number) => web(p, "other", `blog${n}.example.com`, `[예시] 블로그 글 ${n}`);
const review = (p: number) => web(p, "other", "review.example.com", "[예시] CRM 리뷰 사이트");
const hubspot = (p: number) => web(p, "competitor", "hubspot.com", "HubSpot · 비교 가이드");

type DayState = { status: "aio_present" | "aio_absent"; citations: AioCitation[] } | null;

interface DemoKeyword {
  keyword: string;
  group: AioKeywordGroup;
  /** d = 0(오늘) … -(DAYS-1) */
  state: (d: number) => DayState;
  paragraphs?: AioParagraph[];
}

// 시안 3p "최근 14일 인용 히스토리"의 타일 순서
const SLACK_LAST_14 = ["no", "no", "no", "no", "no", "yt", "yt", "own", "own", "yt", "own", "own", "own", "own"];

const KEYWORDS: DemoKeyword[] = [
  {
    keyword: "Slack 세일즈포스 연동",
    group: "howto",
    state: (d) => {
      const tile = d > -14 ? SLACK_LAST_14[13 + d] : "no";
      if (tile === "own") return { status: "aio_present", citations: [own(1, "demoSlack01", 134), salesforceHelp(2), otherVideo(3, "demoOther03"), blog(4, 1), blog(5, 2)] };
      if (tile === "yt") return { status: "aio_present", citations: [salesforceHelp(1), otherVideo(2, "demoOther03"), blog(3, 1)] };
      return { status: "aio_present", citations: [salesforceHelp(1), blog(2, 1), blog(3, 2)] };
    },
    paragraphs: [
      { text: "Slack과 Salesforce는 공식 앱을 설치한 뒤 두 계정을 인증하면 연결되며, 레코드 알림을 채널로 받거나 Slack에서 바로 레코드를 조회할 수 있습니다.", sources: [1] },
      { text: "관리자는 연동 범위와 권한을 먼저 설정하는 것이 좋습니다.", sources: [2, 3] },
      { text: "자주 묻는 설정은 알림 규칙, 채널 매핑, 사용자 권한 동기화입니다.", sources: [4, 5] },
    ],
  },
  {
    keyword: "세일즈포스 에이전트포스란",
    group: "brand",
    state: (d) =>
      d > -7
        ? { status: "aio_present", citations: [salesforceHelp(1), own(2, "demoAgent01", 48), blog(3, 3), blog(4, 4), review(5), blog(6, 5)] }
        : d > -35
          ? { status: "aio_present", citations: [salesforceHelp(1), blog(2, 3), own(3, "demoAgent01", 48), blog(4, 4), review(5), blog(6, 5)] }
          : { status: "aio_present", citations: [salesforceHelp(1), blog(2, 3), review(3)] },
  },
  {
    keyword: "영업 파이프라인 관리 방법",
    group: "howto",
    state: (d) =>
      d > -21
        ? { status: "aio_present", citations: [blog(1, 6), blog(2, 7), own(3, "demoPipe001", 330), otherVideo(4, "demoOther01"), blog(5, 8), blog(6, 9), review(7)] }
        : { status: "aio_present", citations: [blog(1, 6), otherVideo(2, "demoOther01"), blog(3, 7)] },
  },
  {
    keyword: "CRM 도입 절차",
    group: "howto",
    state: (d) =>
      d > -5
        ? { status: "aio_present", citations: [blog(1, 10), otherVideo(2, "demoOther01"), salesforceHelp(3)] }
        : d > -30
          ? { status: "aio_present", citations: [blog(1, 10), own(2, "demoPipe001", 95), salesforceHelp(3)] }
          : { status: "aio_present", citations: [blog(1, 10), otherVideo(2, "demoOther01")] },
  },
  {
    keyword: "CRM 추천",
    group: "category",
    state: () => ({ status: "aio_present", citations: [review(1), otherVideo(2, "demoOther02"), hubspot(3), blog(4, 11)] }),
  },
  {
    keyword: "Salesforce vs HubSpot",
    group: "comparison",
    // 가끔 AIO가 안 뜨는 날이 섞인 키워드 (9일에 한 번)
    state: (d) => ((d + 3) % 9 === 0 ? { status: "aio_absent", citations: [] } : { status: "aio_present", citations: [review(1), hubspot(2), blog(3, 12), blog(4, 13)] }),
  },
  {
    keyword: "AI 에이전트 CRM",
    group: "category",
    state: () => ({ status: "aio_present", citations: [salesforceHelp(1), blog(2, 14), review(3)] }),
  },
  {
    keyword: "세일즈포스 가격",
    group: "brand",
    state: () => ({ status: "aio_absent", citations: [] }),
  },
  {
    keyword: "Slack CRM 연동",
    group: "howto",
    state: (d) =>
      d > -10
        ? { status: "aio_present", citations: [own(1, "demoSlack01", 134), blog(2, 15), salesforceHelp(3)] }
        : { status: "aio_present", citations: [blog(1, 15), salesforceHelp(2)] },
  },
  {
    keyword: "세일즈포스 알림 설정",
    group: "howto",
    state: (d) =>
      d > -4
        ? { status: "aio_present", citations: [salesforceHelp(1), own(2, "demoSlack01", 200), blog(3, 16)] }
        : { status: "aio_present", citations: [salesforceHelp(1), blog(2, 16)] },
  },
];

function defaultParagraphs(citations: AioCitation[]): AioParagraph[] {
  return citations.length > 0
    ? [{ text: "※ 샘플 데이터입니다. 실제 수집된 AI Overview 원문이 이 자리에 표시됩니다.", sources: citations.map((c) => c.position) }]
    : [];
}

export interface DemoAioData {
  settings: BrandAioSettings;
  keywords: AioKeyword[];
  observations: AioObservation[];
  videos: Record<string, YoutubeVideoMeta>;
  workLogs: AioVideoWorkLog[];
}

export function buildDemoAioData(today: string): DemoAioData {
  const optimizationDate = addDays(today, -21);
  const keywords: AioKeyword[] = KEYWORDS.map((k, i) => ({
    id: `demo-aiokw-${i + 1}`,
    keyword: k.keyword,
    group: k.group,
    createdAt: `${addDays(today, -DAYS)}T00:00:00.000Z`,
  }));

  const observations: AioObservation[] = [];
  KEYWORDS.forEach((k, i) => {
    for (let d = -(DAYS - 1); d <= 0; d++) {
      const state = k.state(d);
      if (!state) continue;
      const date = addDays(today, d);
      observations.push({
        id: `demo-aioobs-${i + 1}-${date}`,
        keywordId: keywords[i].id,
        device: "mobile",
        collectedAt: `${addDays(date, -1)}T23:00:00.000Z`, // 한국 시간 오전 8시
        collectedDate: date,
        status: state.status,
        aioText: null,
        paragraphs: state.status === "aio_present" ? (d === 0 && k.paragraphs ? k.paragraphs : defaultParagraphs(state.citations)) : [],
        citations: state.citations,
        hasScreenshot: false,
        errorMessage: null,
      });
    }
  });

  const workLogs: AioVideoWorkLog[] = [
    { id: "demo-work-1", videoId: "demoSlack01", workDate: addDays(optimizationDate, 1), workType: "한국어 자막(SRT) 업로드", note: null },
    { id: "demo-work-2", videoId: "demoSlack01", workDate: addDays(optimizationDate, 3), workType: "챕터(타임스탬프) 추가", note: null },
    { id: "demo-work-3", videoId: "demoSlack01", workDate: addDays(optimizationDate, 5), workType: "설명란 FAQ · 키워드 문장 보강", note: null },
  ];

  return {
    settings: { country: "kr", language: "ko", devices: ["mobile"], optimizationDate, saved: true },
    keywords,
    observations,
    videos: VIDEOS,
    workLogs,
  };
}
