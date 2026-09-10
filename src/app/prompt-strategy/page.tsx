import { PromptStrategyClient } from "@/components/prompt-strategy/PromptStrategyClient";
import { DEFAULT_ORG_ID, db, GscCraftedPrompt, LlmBrainstormCard, PromptStrategySuggestion, PromptStrategyTopicRow } from "@/lib/db";
import { getRealGscCoverageGaps, getRealGscTopPages } from "@/lib/backend/gscSearchAnalyticsReader";
import { listTrackedTopics } from "@/lib/backend/trackedTopics";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getDeletedLibraryRowIds } from "@/lib/backend/deletedLibraryRows";
import { getLlmBridgeEntry, getLlmBridgeScope } from "@/lib/backend/llmBridgeStore";
import { formatTopicBrandMentionsDigest, getRealTopicBrandMentions } from "@/lib/backend/collectionStatsReader";

const DEFAULT_BRAND_ID = "brand-neodigm";

// GSC 연결/추적 프롬프트가 방금 바뀌었을 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function PromptStrategyPage() {
  const demo = await isDemoMode();
  const [
    data,
    promptLibraryRowsRaw,
    trackedRows,
    deletedIds,
    gscKeywordCraftedPrompts,
    brainstormCards,
    topicBrandMentions,
    citationTestPrompts,
    topPages,
  ] = await Promise.all([
    db.promptStrategy.get(DEFAULT_ORG_ID),
    db.promptLibrary.list(DEFAULT_ORG_ID),
    listTrackedTopics(),
    getDeletedLibraryRowIds(),
    getLlmBridgeScope<GscCraftedPrompt[]>("gsc-keyword-prompts"),
    getLlmBridgeEntry<LlmBrainstormCard[]>("llm-brainstorm", "current"),
    demo ? Promise.resolve(null) : getRealTopicBrandMentions().catch(() => null),
    getLlmBridgeScope<GscCraftedPrompt[]>("citation-test-prompts"),
    demo ? Promise.resolve(null) : getRealGscTopPages(DEFAULT_BRAND_ID, 5).catch(() => null),
  ]);
  if (!data) return null;

  // 브레인스토밍 마법사 1단계 프롬프트에 그대로 붙여넣을 실측 표.
  const brainstormDigest = formatTopicBrandMentionsDigest(topicBrandMentions ?? []);

  // mock 시드 라이브러리 행이 삭제됐으면(라이브러리에서 지운 뒤 "삭제된 id
  // 목록"에 기록됨) 여기서도 걸러내야 한다 — 안 그러면 라이브러리에서
  // 지워서 미추적 상태가 됐는데도 여기선 여전히 "추적됨"으로 남아 다시
  // 추적할 수 없는 불일치가 생긴다.
  const promptLibraryRows = promptLibraryRowsRaw.filter((r) => !deletedIds.has(r.id));
  const trackedPrompts = [...promptLibraryRows, ...trackedRows].map((r) => r.prompt);
  const realGaps = demo ? null : await getRealGscCoverageGaps(DEFAULT_BRAND_ID, trackedPrompts).catch(() => null);

  // 실 GSC 연결이 있으면 mock GSC 토픽(st-1, st-2 — 가짜 노출수)을 뺀다.
  // GSC 키워드 자체는 프롬프트 문장이 아니므로(사람이 검색창에 친 짧은
  // 구절) 화면에 직접 노출하지 않고, 키워드마다 그룹을 만든 뒤 그 키워드를
  // 바탕으로 LLM에 물어봐서 얻은 실제 프롬프트 문장(gscKeywordCraftedPrompts)
  // 만 하위 행으로 채운다. 아직 채워지지 않은 키워드는 "아직 만든 프롬프트
  // 없음" 상태로 빈 그룹만 보인다. LLM 브레인스토밍 소스는 그대로 둔다 —
  // GSC와 무관.
  const gscKeywordGroups = (realGaps ?? []).map((gap, i) => ({ ...gap, id: `gsc-kw-${i}` }));

  const craftedTopics: PromptStrategyTopicRow[] = gscKeywordGroups.flatMap((gap) =>
    (gscKeywordCraftedPrompts[gap.topic] ?? []).map((crafted, j) => ({
      id: `${gap.id}-prompt-${j}`,
      groupId: gap.id,
      topic: crafted.prompt,
      market: crafted.market ?? gap.market,
      source: "gsc" as const,
      gscImpressions: null,
      brandMentions: crafted.brandMentions ?? [],
      intent: crafted.intent,
      branded: crafted.branded,
      reasoning: crafted.reasoning,
    }))
  );

  const topicsAfterGsc = realGaps ? [...craftedTopics, ...data.topics.filter((t) => t.source !== "gsc")] : data.topics;

  const keywordSuggestions = gscKeywordGroups.map((gap) => ({
    id: gap.id,
    tag: "coverage_gap" as const,
    source: "gsc" as const,
    title: `"${gap.topic}" 키워드 기반 프롬프트`,
    summary: `GSC에서 실제로 노출은 발생하지만(노출 ${gap.gscImpressions?.toLocaleString("ko-KR")}회) 우리 프롬프트 목록에 없는 검색어입니다. 이 검색어를 바탕으로 LLM에 물어봐서 얻은 프롬프트를 추적하세요.`,
    stat: `GSC 노출 ${gap.gscImpressions?.toLocaleString("ko-KR")}회`,
    gscKeyword: gap.topic,
    gscTopPage: gap.gscTopPage,
  }));

  // "인용 테스트" — GSC 실측(노출은 많은데 클릭이 적은 우리 페이지)으로
  // 타겟 URL을 고르고, 그 URL로 LLM에게 인용 테스트 질문을 만들어달라고
  // 물어본 결과(citation-test-prompts)를 하위 행으로 채운다. GSC 키워드
  // 그룹과 완전히 같은 패턴 — 타겟 선정은 100% 실측, 질문 문장만 LLM 우회.
  const citationGroups = (topPages ?? []).map((page, i) => ({ ...page, id: `citation-${i}` }));
  const citationTopics: PromptStrategyTopicRow[] = citationGroups.flatMap((page) =>
    (citationTestPrompts[page.url] ?? []).map((crafted, j) => ({
      id: `${page.id}-prompt-${j}`,
      groupId: page.id,
      topic: crafted.prompt,
      market: crafted.market ?? "KR",
      source: "citation_attempt" as const,
      gscImpressions: null,
      brandMentions: crafted.brandMentions ?? [],
      intent: crafted.intent,
      branded: crafted.branded,
      reasoning: crafted.reasoning,
    }))
  );
  const citationSuggestions = citationGroups.map((page) => ({
    id: page.id,
    tag: "coverage_gap" as const,
    source: "citation_attempt" as const,
    title: `"${page.url}" 콘텐츠 인용 테스트`,
    summary: `GSC 실측: 노출 ${page.impressions.toLocaleString("ko-KR")}회 대비 클릭 ${page.clicks.toLocaleString("ko-KR")}회로 노출 대비 클릭이 낮은 페이지입니다. AI 답변에서 출처로 인용되는지 확인하는 프롬프트입니다.`,
    stat: `GSC 노출 ${page.impressions.toLocaleString("ko-KR")}회 · 클릭 ${page.clicks.toLocaleString("ko-KR")}회`,
    citationTestUrl: page.url,
  }));

  // LLM 브레인스토밍 마법사로 실제로 등록된 카드가 있으면, mock
  // llm_brainstorm 카드 전체를 그걸로 교체한다. brandMentions는 LLM
  // 응답이 아니라 항상 실측 표(topicBrandMentions)에서 다시 조회한다 —
  // LLM이 지어낸 숫자를 절대 신뢰하지 않는다. 아직 한 번도 수집되지 않은
  // 토픽이면 "미수집"으로 남는다(brandMentions 빈 배열).
  const topicBrandMentionsByTopic = new Map((topicBrandMentions ?? []).map((r) => [r.topic, r]));
  const brainstormSuggestions: PromptStrategySuggestion[] = (brainstormCards ?? []).map((card) => ({
    id: card.id,
    tag: card.tag,
    source: "llm_brainstorm" as const,
    title: card.title,
    summary: card.summary,
    stat: card.stat,
  }));
  const brainstormTopics: PromptStrategyTopicRow[] = (brainstormCards ?? []).flatMap((card) =>
    card.topics.map((topic, i) => {
      const real = topicBrandMentionsByTopic.get(topic);
      return {
        id: `${card.id}-topic-${i}`,
        groupId: card.id,
        topic,
        market: real?.market ?? "KR",
        source: "llm_brainstorm" as const,
        gscImpressions: null,
        brandMentions: real?.brandMentions ?? [],
      };
    })
  );

  const suggestions = realGaps ? [...keywordSuggestions, ...data.suggestions.filter((s) => s.source !== "gsc")] : data.suggestions;
  const suggestionsWithBrainstorm = brainstormCards
    ? [...suggestions.filter((s) => s.source !== "llm_brainstorm"), ...brainstormSuggestions]
    : suggestions;
  const suggestionsWithCitation = topPages
    ? [...suggestionsWithBrainstorm.filter((s) => s.source !== "citation_attempt"), ...citationSuggestions]
    : suggestionsWithBrainstorm;
  const topicsAfterBrainstorm = brainstormCards
    ? [...topicsAfterGsc.filter((t) => t.source !== "llm_brainstorm"), ...brainstormTopics]
    : topicsAfterGsc;
  const topics = topPages
    ? [...topicsAfterBrainstorm.filter((t) => t.source !== "citation_attempt"), ...citationTopics]
    : topicsAfterBrainstorm;

  // 이미 프롬프트 라이브러리에 있는 프롬프트는 "추적됨" 상태로 미리
  // 표시한다 — 프롬프트 문장이 완전히 같으면 같은 프롬프트로 간주(대소문자/
  // 앞뒤 공백만 무시). 이렇게 하면 클라이언트의 "그룹 전체가 추적되면
  // 배너 자동 숨김" 로직이 첫 로드부터도 그대로 적용되고, 라이브러리에서
  // 삭제하면(실제로 .tmp 파일도 지워짐) 다음 로드 때 다시 노출된다 — 이
  // 페이지는 캐시하지 않으므로(force-dynamic) 항상 최신 라이브러리 상태를
  // 반영한다.
  const trackedPromptSet = new Set(trackedPrompts.map((p) => p.trim().toLowerCase()));
  const preTrackedIds = topics.filter((t) => trackedPromptSet.has(t.topic.trim().toLowerCase())).map((t) => t.id);

  // 최상단 "구글서치콘솔 분석"/"인용 테스트 분석" 마법사가 한 번에 등록할
  // 실측 그룹 목록 — 프롬프트에 그대로 나열한다.
  const gscKeywordTargets = gscKeywordGroups.map((gap) => ({ keyword: gap.topic, impressions: gap.gscImpressions ?? 0 }));
  const citationTargets = citationGroups.map((page) => ({ url: page.url, impressions: page.impressions, clicks: page.clicks }));

  return (
    <PromptStrategyClient
      initial={{ suggestions: suggestionsWithCitation, topics }}
      preTrackedIds={preTrackedIds}
      brainstormDigest={brainstormDigest}
      gscKeywordTargets={gscKeywordTargets}
      citationTargets={citationTargets}
    />
  );
}
