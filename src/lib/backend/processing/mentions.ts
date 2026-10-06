import { BrandSeed, MentionSeed, PromptRunSeed } from "@/lib/db/types";
import { classifySentiment, findBrandMentions, normalizeText } from "./text";

export function extractMentionsFromRun(run: PromptRunSeed, brands: BrandSeed[]): MentionSeed[] {
  const ordered = findBrandMentions(run.rawResponse, brands);
  let position = 1;
  const presentCount = ordered.filter((m) => m.index !== null).length;
  const textLength = Math.max(1, normalizeText(run.rawResponse).length);

  return ordered.map(({ brand, index }) => {
    const isPresent = index !== null;
    const sentiment = classifySentiment(run.rawResponse, brand);

    return {
      id: `mention-${run.id}-${brand.id}`,
      promptRunId: run.id,
      brandId: brand.id,
      isPresent,
      position: isPresent ? position++ : null,
      offsetRatio: isPresent ? Math.min(1, (index as number) / textLength) : null,
      othersPresent: isPresent ? presentCount - 1 : 0,
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.score,
    };
  });
}
