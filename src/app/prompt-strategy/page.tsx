import { PromptStrategyClient } from "@/components/prompt-strategy/PromptStrategyClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function PromptStrategyPage() {
  const data = await db.promptStrategy.get(DEFAULT_ORG_ID);
  if (!data) return null;

  return <PromptStrategyClient initial={data} />;
}
