import { NextRequest, NextResponse } from "next/server";
import { setTopicOpportunityTarget } from "@/lib/backend/topicOpportunityTargets";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl.trim() : "";

  if (!topic) {
    return NextResponse.json({ error: "토픽이 필요합니다." }, { status: 400 });
  }

  await setTopicOpportunityTarget(topic, targetUrl);
  return NextResponse.json({ ok: true });
}
