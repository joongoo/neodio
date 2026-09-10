import { NextRequest, NextResponse } from "next/server";
import { setLlmBridgeEntry } from "@/lib/backend/llmBridgeStore";

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
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const data = body?.data;

  if (!key) {
    return NextResponse.json({ error: "key가 필요합니다." }, { status: 400 });
  }

  if (scope === "source-recommendation") {
    if (typeof data?.recommendation !== "string" || !data.recommendation.trim()) {
      return NextResponse.json({ error: "recommendation 필드를 찾지 못했습니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(scope, key, {
      recommendation: data.recommendation.trim(),
      reasoning: typeof data.reasoning === "string" ? data.reasoning.trim() : "",
    });
    return NextResponse.json({ ok: true });
  }

  if (GUIDE_SCOPES.has(scope)) {
    if (typeof data?.guide !== "string" || !data.guide.trim()) {
      return NextResponse.json({ error: "guide 필드를 찾지 못했습니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(scope, key, { guide: data.guide.trim() });
    return NextResponse.json({ ok: true });
  }

  if (scope === "gsc-keyword-prompts") {
    if (!Array.isArray(data) || data.length === 0 || data.some((item) => typeof item?.prompt !== "string" || !item.prompt.trim())) {
      return NextResponse.json({ error: "prompt 필드를 가진 항목들의 배열이어야 합니다. LLM 응답 형식을 확인해주세요." }, { status: 400 });
    }
    await setLlmBridgeEntry(scope, key, data);
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
        c.topics.every((t: unknown) => typeof t === "string" && t.trim().length > 0)
      );
    };
    if (!Array.isArray(data) || data.length === 0 || !data.every(isValidCard)) {
      return NextResponse.json(
        { error: "각 카드는 tag(coverage_gap|strength)/title/summary/stat/topics(문자열 배열)를 모두 가져야 합니다." },
        { status: 400 }
      );
    }
    await setLlmBridgeEntry(scope, key, data);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 scope입니다." }, { status: 400 });
}
