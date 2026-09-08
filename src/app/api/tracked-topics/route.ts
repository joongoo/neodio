import { NextRequest, NextResponse } from "next/server";
import { trackTopic } from "@/lib/backend/trackedTopics";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";

  if (!topic || !category) {
    return NextResponse.json({ error: "토픽과 카테고리가 모두 필요합니다." }, { status: 400 });
  }

  await trackTopic(topic, category);
  return NextResponse.json({ ok: true });
}
