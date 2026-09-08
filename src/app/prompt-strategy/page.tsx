import { PromptStrategyClient } from "@/components/prompt-strategy/PromptStrategyClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealGscCoverageGaps } from "@/lib/backend/gscSearchAnalyticsReader";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { isDemoMode } from "@/lib/backend/demoMode";

const DEFAULT_BRAND_ID = "brand-neodigm";

// GSC 연결/추적 프롬프트가 방금 바뀌었을 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function PromptStrategyPage() {
  const demo = await isDemoMode();
  const [data, promptLibraryRows, trackedRows] = await Promise.all([
    db.promptStrategy.get(DEFAULT_ORG_ID),
    db.promptLibrary.list(DEFAULT_ORG_ID),
    listTrackedTopics(),
  ]);
  if (!data) return null;

  const trackedPrompts = [...promptLibraryRows, ...trackedRows].map((r) => r.prompt);
  const realGaps = demo ? null : await getRealGscCoverageGaps(DEFAULT_BRAND_ID, trackedPrompts).catch(() => null);

  // 실 GSC 연결이 있으면 mock GSC 토픽(st-1, st-2 — 가짜 노출수)을 실제
  // 커버리지 공백으로 교체. LLM 브레인스토밍 소스는 그대로 둔다 — GSC와
  // 무관.
  const topics = realGaps ? [...realGaps, ...data.topics.filter((t) => t.source !== "gsc")] : data.topics;

  const topGap = realGaps?.[0];
  const suggestions = topGap
    ? [
        {
          id: "sug-gsc-real",
          tag: "coverage_gap" as const,
          source: "gsc" as const,
          title: `"${topGap.topic}" 커버리지 공백`,
          summary: "GSC에서 실제로 노출은 발생하지만 우리 프롬프트 목록에 없는 검색어입니다. 관련 프롬프트를 추가하면 AI 답변 노출을 넓힐 수 있어요.",
          stat: `GSC 노출 ${topGap.gscImpressions?.toLocaleString("ko-KR")}회`,
        },
        ...data.suggestions.filter((s) => s.source !== "gsc"),
      ]
    : data.suggestions;

  return <PromptStrategyClient initial={{ suggestions, topics }} />;
}
