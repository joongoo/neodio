import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { checkStageA } from "../../../../../scripts/dataforseo-poc/service.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const denied = await guardApi("staff");
  if (denied) return denied;
  const runId = request.nextUrl.searchParams.get("runId") ?? "";
  if (!runId) return NextResponse.json({ error: "runId가 필요합니다." }, { status: 400 });
  try {
    return NextResponse.json({ run: await checkStageA(runId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stage A 상태 조회에 실패했습니다." }, { status: 503 });
  }
}
