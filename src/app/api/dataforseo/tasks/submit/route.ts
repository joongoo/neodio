import { NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";

export const runtime = "nodejs";

/** Retired: direct submission bypassed queue capacity and confirmation policy. */
export async function POST() {
  const denied = await guardApi("write");
  if (denied) return denied;
  return NextResponse.json({ code: "request_detail_required", error: "개별 작업 직접 제출은 종료되었습니다. 수집 요청 상세에서 대기 항목을 선택하고 비용 확인 후 실행을 요청해 주세요. 요청에 연결되지 않은 과거 예약은 직접 실행할 수 없습니다." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
