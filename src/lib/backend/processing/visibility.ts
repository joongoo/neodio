import { BrandSeed, CitationSeed, MentionSeed, PromptRunSeed, VisibilityScoreSeed } from "@/lib/db/types";
import { toUtcSundayWeekStart } from "./date";

function scorePercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function positionValue(position: number | null) {
  if (position === null) return 0;
  if (position === 1) return 1;
  if (position === 2) return 0.75;
  if (position === 3) return 0.55;
  return 0.35;
}

/**
 * 언급 하나가 답변 안에서 얼마나 눈에 띄는가(0~1).
 * - 경쟁사와 함께 나온 답변: 언급 순서와 답변 내 위치(앞일수록 높음)를 반반.
 * - 혼자 나온 답변: 순서는 "1번째"가 당연해 정보가 없으므로 답변 내 위치만 본다.
 * - 위치 정보가 없는 예전 분석: 순서만(기존 방식).
 */
export function mentionProminence(mention: Pick<MentionSeed, "position" | "offsetRatio" | "othersPresent">): number {
  if (mention.offsetRatio === null || mention.offsetRatio === undefined) return positionValue(mention.position);
  const early = 1 - Math.max(0, Math.min(1, mention.offsetRatio));
  if (!mention.othersPresent) return early;
  return positionValue(mention.position) * 0.5 + early * 0.5;
}

/**
 * 총점 = 언급 45% + 인용 20% + 노출 위치 35%.
 * 감성은 점수에서 뺀다 — 지금 감성 판정은 브랜드 주변의 긍정·부정 단어 개수를 세는 방식이라
 * 일반 문장의 단어("문제", "제공" 등)에 흔들려 신뢰할 수 없다. 감성은 별도 지표로만 보여주고,
 * 신뢰할 수 있는 분류(LLM 등)가 연동되면 다시 점수에 넣는다.
 */
export const VISIBILITY_WEIGHTS = { mentions: 0.45, citations: 0.2, position: 0.35 } as const;

export function calculateVisibilityTotal(scores: {
  mentionsScore: number;
  citationsScore: number;
  positionScore: number;
}) {
  return Number(
    (
      scores.mentionsScore * VISIBILITY_WEIGHTS.mentions +
      scores.citationsScore * VISIBILITY_WEIGHTS.citations +
      scores.positionScore * VISIBILITY_WEIGHTS.position
    ).toFixed(1)
  );
}

export function buildVisibilityScores(params: {
  organizationId: string;
  brand: BrandSeed;
  runs: PromptRunSeed[];
  mentions: MentionSeed[];
  citations: CitationSeed[];
  /** 실행 id → 가중치. 같은 주·프롬프트·엔진·마켓의 반복 실행을 관측 1건으로 합칠 때 넘긴다(없으면 모두 1). */
  runWeights?: Map<string, number>;
}): VisibilityScoreSeed[] {
  const weightOf = (runId: string) => params.runWeights?.get(runId) ?? 1;
  const successfulRuns = params.runs.filter((run) => run.status === "success");
  const groups = new Map<string, PromptRunSeed[]>();

  for (const run of successfulRuns) {
    const weekStart = toUtcSundayWeekStart(run.runAt);
    const key = `${weekStart}:${run.llmModelId}:${run.marketId}`;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }

  return Array.from(groups.entries()).map(([key, runs]) => {
    const [weekStart, llmModelId, marketId] = key.split(":");
    const runIds = new Set(runs.map((run) => run.id));
    const brandMentions = params.mentions.filter(
      (mention) => mention.brandId === params.brand.id && runIds.has(mention.promptRunId)
    );
    // 한 답변에 자사 인용이 여러 개여도 1로 센다 — "인용된 답변 비율"이어야
    // 100%를 넘지 않고 인용이 많은 답변 하나에 점수가 끌려가지 않는다.
    const ownCitedRunIds = new Set(
      params.citations.filter((citation) => citation.isOwnDomain && runIds.has(citation.promptRunId)).map((c) => c.promptRunId)
    );
    const presentMentions = brandMentions.filter((mention) => mention.isPresent);

    // 네 항목 모두 "전체 실행" 대비 — 언급되지 않은 실행은 위치·감성도 0으로 센다.
    // (언급된 답변만 평균내면 1%만 언급돼도 위치·감성이 만점에 가까워 총점이 부풀려진다.)
    const runCount = Math.max(1e-9, runs.reduce((total, run) => total + weightOf(run.id), 0));
    const mentionsScore = scorePercent(presentMentions.reduce((total, mention) => total + weightOf(mention.promptRunId), 0) / runCount);
    const citationsScore = scorePercent([...ownCitedRunIds].reduce((total, id) => total + weightOf(id), 0) / runCount);
    const positionScore = scorePercent(
      presentMentions.reduce((total, mention) => total + mentionProminence(mention) * weightOf(mention.promptRunId), 0) / runCount
    );
    const sentimentScore = scorePercent(
      presentMentions.reduce((total, mention) => total + mention.sentimentScore * weightOf(mention.promptRunId), 0) / runCount
    );

    return {
      id: `score-${params.brand.id}-${weekStart}-${llmModelId}-${marketId}`,
      organizationId: params.organizationId,
      brandId: params.brand.id,
      marketId,
      llmModelId,
      weekStart,
      mentionsScore,
      citationsScore,
      positionScore,
      sentimentScore,
      totalScore: calculateVisibilityTotal({ mentionsScore, citationsScore, positionScore }),
    };
  });
}
