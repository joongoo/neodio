import { NextRequest, NextResponse } from "next/server";
import { setLlmBridgeEntries, setLlmBridgeEntry } from "@/lib/backend/llmBridgeStore";
import { DEFAULT_ORG_ID } from "@/lib/db";

const PROMPT_ARRAY_SCOPES = new Set(["gsc-keyword-prompts", "citation-test-prompts"]);

interface CraftedPromptItem {
  prompt: string;
  category: string;
  topic: string;
}

// "구글서치콘솔 분석"/"인용 테스트 분석" 마법사 — 이제 각 항목이 이 프롬프트를
// 어느 카테고리·토픽으로 묶었는지도 함께 답변해야 한다(데이터 클렌징:
// 분석 단계에서부터 기존 카테고리·토픽을 재사용하거나, 정말 새 주제면 새로
// 만들게 한다).
function isValidCraftedPromptArray(value: unknown): value is CraftedPromptItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        typeof item?.prompt === "string" &&
        item.prompt.trim() &&
        typeof item?.category === "string" &&
        item.category.trim() &&
        typeof item?.topic === "string" &&
        item.topic.trim()
    )
  );
}

// LLM API 연결 전 우회 저장소용 공용 엔드포인트. scope별로 사람이 붙여넣은
// 값이 기대하는 모양이 다르므로 여기서 최소한의 형태 검증만 한다 —
// "source-recommendation"은 {recommendation, reasoning}, 나머지
// (content-guide-*, topic-guide)는 {guide} 문자열 하나.
const GUIDE_SCOPES = new Set([
  "content-guide-complexity",
  "content-guide-faq",
  "content-guide-toc",
  "content-guide-multimedia",
  "content-guide-content-recovery",
  "topic-guide",
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = typeof body?.scope === "string" ? body.scope : "";

  // 최상단 "한 번에 등록" 마법사 — 여러 key(검색어/URL)를 한 번의 LLM
  // 답변으로 동시에 채운다. scope당 값 형태 검증은 개별 등록과 동일하게 한다.
  if (body?.bulk === true) {
    const entries = body?.entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries) || Object.keys(entries).length === 0) {
      return NextResponse.json({ error: "entries가 필요합니다." }, { status: 400 });
    }
    if (!PROMPT_ARRAY_SCOPES.has(scope)) {
      return NextResponse.json({ error: "이 scope는 일괄 등록을 지원하지 않습니다." }, { status: 400 });
    }
    if (!Object.values(entries).every(isValidCraftedPromptArray)) {
      return NextResponse.json(
        { error: "각 항목은 prompt 필드를 가진 항목들의 배열이어야 합니다. LLM 응답 형식을 확인해주세요." },
        { status: 400 }
      );
    }
    await setLlmBridgeEntries(DEFAULT_ORG_ID, scope, entries as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  }

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const data = body?.data;

  if (!key) {
    return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
  }

  if (scope === "source-recommendation") {
    if (typeof data?.recommendation !== "string" || !data.recommendation.trim()) {
      return NextResponse.json({ error: "recommendation 필드를 찾지 못했습니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(DEFAULT_ORG_ID, scope, key, {
      recommendation: data.recommendation.trim(),
      reasoning: typeof data.reasoning === "string" ? data.reasoning.trim() : "",
    });
    return NextResponse.json({ ok: true });
  }

  if (GUIDE_SCOPES.has(scope)) {
    if (typeof data?.guide !== "string" || !data.guide.trim()) {
      return NextResponse.json({ error: "guide 필드를 찾지 못했습니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(DEFAULT_ORG_ID, scope, key, { guide: data.guide.trim() });
    return NextResponse.json({ ok: true });
  }

  if (PROMPT_ARRAY_SCOPES.has(scope)) {
    if (!isValidCraftedPromptArray(data)) {
      return NextResponse.json({ error: "prompt 필드를 가진 항목들의 배열이어야 합니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(DEFAULT_ORG_ID, scope, key, data);
    return NextResponse.json({ ok: true });
  }

  // "성과가 좋은 프롬프트 및 토픽"의 여러 프롬프트를 하나의 토픽으로 묶는
  // 그룹핑 — key는 "current" 하나뿐(조직 전체에 그룹핑 결과 하나).
  if (scope === "prompt-topic-groups") {
    const isValidGroup = (item: unknown) => {
      const g = item as Record<string, unknown>;
      return (
        typeof g?.topic === "string" &&
        g.topic.trim().length > 0 &&
        Array.isArray(g?.prompts) &&
        g.prompts.length > 0 &&
        g.prompts.every((p: unknown) => typeof p === "string" && p.trim().length > 0)
      );
    };
    if (!Array.isArray(data) || data.length === 0 || !data.every(isValidGroup)) {
      return NextResponse.json(
        { error: "각 항목은 topic(문자열)과 prompts(문자열 배열)를 가져야 합니다. LLM 응답 형식을 확인해주세요." },
        { status: 400 }
      );
    }
    // setLlmBridgeEntry -> store.putBridge가 트랜잭션 안에서 bridge_entries
    // 저장과 함께 prompts.topic_id/uncategorized_category_id도 그대로 다시
    // 써서 반영한다(PromptStore.replaceGroups) — 라이브러리와 가시성 개요가
    // 같은 SQLite 테이블을 보므로 별도 동기화 단계가 필요 없다.
    await setLlmBridgeEntry(DEFAULT_ORG_ID, scope, key, data);
    return NextResponse.json({ ok: true });
  }

  if (scope === "llm-brainstorm") {
    const VALID_TAGS = new Set(["coverage_gap", "strength"]);
    const isValidCard = (item: unknown) => {
      const c = item as Record<string, unknown>;
      return (
        typeof c?.tag === "string" &&
        VALID_TAGS.has(c.tag) &&
        typeof c?.title === "string" &&
        c.title.trim().length > 0 &&
        typeof c?.summary === "string" &&
        c.summary.trim().length > 0 &&
        typeof c?.stat === "string" &&
        Array.isArray(c?.topics) &&
        c.topics.length > 0 &&
        isValidCraftedPromptArray(c.topics)
      );
    };
    if (!Array.isArray(data) || data.length === 0 || !data.every(isValidCard)) {
      return NextResponse.json(
        { error: "각 카드는 tag(coverage_gap|strength)/title/summary/stat/topics(문자열 배열)를 모두 가져야 합니다." },
        { status: 400 }
      );
    }
    await setLlmBridgeEntry(DEFAULT_ORG_ID, scope, key, data);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 scope입니다." }, { status: 400 });
}
