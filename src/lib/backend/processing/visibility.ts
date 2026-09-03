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

export function calculateVisibilityTotal(scores: {
  mentionsScore: number;
  citationsScore: number;
  positionScore: number;
  sentimentScore: number;
}) {
  return Number(
    (
      scores.mentionsScore * 0.35 +
      scores.citationsScore * 0.15 +
      scores.positionScore * 0.3 +
      scores.sentimentScore * 0.2
    ).toFixed(1)
  );
}

export function buildVisibilityScores(params: {
  organizationId: string;
  brand: BrandSeed;
  runs: PromptRunSeed[];
  mentions: MentionSeed[];
  citations: CitationSeed[];
}): VisibilityScoreSeed[] {
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
    const ownCitations = params.citations.filter(
      (citation) => citation.isOwnDomain && runIds.has(citation.promptRunId)
    );
    const presentMentions = brandMentions.filter((mention) => mention.isPresent);

    const mentionsScore = scorePercent(presentMentions.length / Math.max(1, runs.length));
    const citationsScore = scorePercent(ownCitations.length / Math.max(1, runs.length));
    const positionScore = scorePercent(
      presentMentions.reduce((total, mention) => total + positionValue(mention.position), 0) /
        Math.max(1, presentMentions.length)
    );
    const sentimentScore = scorePercent(
      presentMentions.reduce((total, mention) => total + mention.sentimentScore, 0) /
        Math.max(1, presentMentions.length)
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
      totalScore: calculateVisibilityTotal({ mentionsScore, citationsScore, positionScore, sentimentScore }),
    };
  });
}
