import { PromptResearchClient } from "@/components/prompt-research/PromptResearchClient";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/backend/demoMode";

const DEFAULT_TOPIC = "마케팅 자동화";

// "Demo" 브랜드는 목업 데이터 검색 화면을, 실제 브랜드는 AI가 제안하는 관련 토픽·질문 화면을 보여 준다.
export const dynamic = "force-dynamic";

export default async function PromptResearchPage() {
  const demo = await isDemoMode();
  const initialResult = demo ? await db.promptResearch.search(DEFAULT_TOPIC) : null;

  return <PromptResearchClient initialTopic={DEFAULT_TOPIC} initialResult={initialResult} live={!demo} />;
}
