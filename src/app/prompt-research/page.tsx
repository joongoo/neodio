import { PromptResearchClient } from "@/components/prompt-research/PromptResearchClient";
import { db } from "@/lib/db";

const DEFAULT_TOPIC = "마케팅 자동화";

export default async function PromptResearchPage() {
  const initialResult = await db.promptResearch.search(DEFAULT_TOPIC);

  return <PromptResearchClient initialTopic={DEFAULT_TOPIC} initialResult={initialResult} />;
}
