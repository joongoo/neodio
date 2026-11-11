import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { publicStageAPlan, startStageA, verifyStageAAccessToken } from "../../../../../scripts/dataforseo-poc/service.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const denied = await guardApi("staff");
  if (denied) return denied;
  if (!verifyStageAAccessToken(request.headers.get("x-neodio-stage-a-token"))) {
    return NextResponse.json({ error: "Stage A 실행 토큰이 올바르지 않습니다." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  const plan = publicStageAPlan();
  if (!query || query.length > 700) return NextResponse.json({ error: "1~700자의 테스트 질의가 필요합니다." }, { status: 400 });
  if (body?.confirmation !== "SUBMIT_STAGE_A_2_TASKS" || body?.confirmedMaxCostUsd !== plan.estimatedMaxCostUsd) {
    return NextResponse.json({ error: "요청 건수와 최대 예상 비용 확인이 필요합니다." }, { status: 400 });
  }
  try {
    const run = await startStageA(query);
    return NextResponse.json({ run }, { status: run.status === "failed" ? 502 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stage A 제출에 실패했습니다." }, { status: 503 });
  }
}
