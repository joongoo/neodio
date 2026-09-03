import { BrandSeed, MentionSeed, PromptRunSeed } from "@/lib/db/types";
import { classifySentiment, findBrandMentions } from "./text";

export function extractMentionsFromRun(run: PromptRunSeed, brands: BrandSeed[]): MentionSeed[] {
  const ordered = findBrandMentions(run.rawResponse, brands);
  let position = 1;

  return ordered.map(({ brand, index }) => {
    const isPresent = index !== null;
    const sentiment = classifySentiment(run.rawResponse, brand);

    return {
      id: `mention-${run.id}-${brand.id}`,
      promptRunId: run.id,
      brandId: brand.id,
      isPresent,
      position: isPresent ? position++ : null,
      sentiment: sentiment.sentiment,
      sentimentScore: sentiment.score,
    };
  });
}
