import { NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";

/** Retired: cancellation must preserve task history and validate worker leases. */
export async function DELETE() {
  const denied = await guardApi("write");
  if (denied) return denied;
  return NextResponse.json({ code: "request_detail_required", error: "예약 삭제는 종료되었습니다. 수집 요청 상세에서 미제출 대기 항목을 선택하고 취소해 주세요. 작업 이력은 유지됩니다. 요청에 연결되지 않은 과거 예약은 직접 취소할 수 없습니다." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
