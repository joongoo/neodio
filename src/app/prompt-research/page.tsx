import { PromptResearchClient } from "@/components/prompt-research/PromptResearchClient";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/backend/demoMode";

const DEFAULT_TOPIC = "마케팅 자동화";

// 실제 파이프라인(LLM API 연동)이 아직 없어 이 화면의 데이터는 전부 mock —
// "Demo" 브랜드에서만 보여주고, 실 브랜드(Neodigm)에서는 "준비 중"으로
// 대체한다. see docs 채팅 스레드: 프롬프트 리서치를 실 데이터로 만들려면
// LLM API 연동이 필요하다는 결론.
export const dynamic = "force-dynamic";

export default async function PromptResearchPage() {
  const demo = await isDemoMode();
  const initialResult = demo ? await db.promptResearch.search(DEFAULT_TOPIC) : null;

  return <PromptResearchClient initialTopic={DEFAULT_TOPIC} initialResult={initialResult} comingSoon={!demo} />;
}
