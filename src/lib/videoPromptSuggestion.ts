import { SEARCH_QUERY_RULE, toSearchQueryText } from "@/lib/searchQueryText";

// YouTube 관리 — 체크한 영상마다 "이 영상이 AI 답변에 인용될 만한" 예상 프롬프트를 만든다.
// 프롬프트 만들기(build) → 응답 검증(parse)을 순수 함수로 둔다. 서버(/api/llm-generate)가 답을 받아오고,
// 화면이 검증한 뒤 사람이 고른 것만 프롬프트 라이브러리에 등록한다. 클라이언트에서도 쓰므로 서버 전용 코드를 가져오지 않는다.

export interface VideoForSuggestion {
  videoId: string;
  title: string;
  /** 설명 앞부분 — 없으면 제목만 근거로 한다. */
  description?: string | null;
}

export interface VideoSuggestionInput {
  brandName: string;
  industry?: string;
  videos: VideoForSuggestion[];
  /** 영상당 만들 개수 */
  perVideo: number;
  /** 이미 라이브러리에 있는 프롬프트 — 겹치지 않게 알려 준다. */
  existingPrompts?: string[];
}

/** 한 번의 AI 호출에 담을 영상 수 — 답이 길어지면 잘리거나 무료 등급 한도에 걸린다. */
export const MAX_VIDEOS_PER_REQUEST = 5;
export const MAX_PER_VIDEO = 6;
export const MAX_PROMPT_LENGTH = 200;
const DESCRIPTION_IN_PROMPT = 500;

export const normalizePromptText = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");

export function buildVideoPromptRequest({ brandName, industry, videos, perVideo, existingPrompts = [] }: VideoSuggestionInput): string {
  const lines: string[] = [
    "당신은 AI 검색(Google AI 개요·AI 모드, 네이버 AI 브리핑) 노출을 분석하는 콘텐츠 전략가입니다.",
    `아래는 "${brandName}"${industry ? `(${industry})` : ""} 채널의 YouTube 영상입니다. 영상마다, 사용자가 AI나 검색창에 물었을 때 이 영상이 답변의 근거로 인용될 만한 "예상 프롬프트"를 ${perVideo}개씩 만드세요.`,
    "",
    "규칙:",
    "- 영상 내용이 실제로 답이 되는 질문·검색어만 만든다. 영상에 없는 내용을 전제로 하지 않는다.",
    "- 짧은 검색어형(2~5단어)과 완전한 질문형을 섞는다. 영상 제목을 그대로 복사하지 않는다.",
    "- 사용자가 브랜드를 이미 알고 묻는 경우가 아니면 브랜드명은 넣지 않는다(브랜드를 모르는 사람이 문제를 검색하는 상황이 목표).",
    `- ${SEARCH_QUERY_RULE}`,
    `- 프롬프트는 한국어, ${MAX_PROMPT_LENGTH}자 이하. 영상끼리, 그리고 아래 "이미 있는 프롬프트"와 같은 문장을 만들지 않는다.`,
    "",
    "영상:",
  ];
  for (const video of videos) {
    const description = (video.description ?? "").replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_IN_PROMPT);
    lines.push(`- videoId: ${video.videoId}`, `  제목: ${video.title}`);
    if (description) lines.push(`  설명: ${description}`);
  }
  if (existingPrompts.length > 0) {
    lines.push("", "이미 있는 프롬프트(중복 금지):", ...existingPrompts.slice(0, 40).map((p) => `- ${p}`));
  }
  lines.push(
    "",
    "JSON만 답하세요(설명·코드블록 없이). 형식:",
    '{"videos":[{"videoId":"<위 videoId 그대로>","prompts":["프롬프트 1","프롬프트 2"]}]}'
  );
  return lines.join("\n");
}

export type ParsedVideoSuggestions = { byVideo: Record<string, string[]>; droppedCount: number } | { error: string };

/** 응답 원문 → 영상별 프롬프트. 입력에 없는 videoId, 빈 문장, 너무 긴 문장, 중복은 버리고 그 수를 센다. */
export function parseVideoPromptSuggestions(raw: string, input: Pick<VideoSuggestionInput, "videos" | "perVideo" | "existingPrompts">): ParsedVideoSuggestions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    try {
      if (start === -1 || end <= start) throw new Error("no object");
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return { error: "JSON으로 해석할 수 없습니다. AI가 JSON만 답하도록 다시 시도해주세요." };
    }
  }
  const list = (parsed as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(list)) return { error: '"videos" 목록이 있는 JSON 객체 형식이어야 합니다.' };

  const known = new Set(input.videos.map((v) => v.videoId));
  const seen = new Set((input.existingPrompts ?? []).map(normalizePromptText));
  const byVideo: Record<string, string[]> = {};
  let dropped = 0;
  for (const entry of list) {
    const videoId = (entry as { videoId?: unknown } | null)?.videoId;
    const prompts = (entry as { prompts?: unknown } | null)?.prompts;
    if (typeof videoId !== "string" || !known.has(videoId) || !Array.isArray(prompts)) {
      dropped += 1;
      continue;
    }
    for (const item of prompts) {
      const text = typeof item === "string" ? item : typeof (item as { text?: unknown })?.text === "string" ? (item as { text: string }).text : "";
      const clean = toSearchQueryText(text.replace(/\s+/g, " ").trim());
      const key = normalizePromptText(clean);
      const mine = (byVideo[videoId] ??= []);
      if (!clean || clean.length > MAX_PROMPT_LENGTH || seen.has(key) || mine.length >= Math.min(input.perVideo, MAX_PER_VIDEO)) {
        dropped += 1;
        continue;
      }
      seen.add(key);
      mine.push(clean);
    }
  }
  if (Object.values(byVideo).every((prompts) => prompts.length === 0)) return { error: "쓸 수 있는 프롬프트가 없습니다. 다시 생성하거나 직접 붙여넣어 주세요." };
  return { byVideo, droppedCount: dropped };
}
