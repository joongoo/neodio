import { NextRequest, NextResponse } from "next/server";
import { trackTopic } from "@/lib/backend/trackedTopics";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : undefined;

  if (!prompt || !category) {
    return NextResponse.json({ error: "프롬프트와 카테고리가 모두 필요합니다." }, { status: 400 });
  }

  await trackTopic(prompt, category, topic);
  return NextResponse.json({ ok: true });
}
