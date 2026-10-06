import { NextRequest, NextResponse } from "next/server";
import { DatalabError, fetchSearchTrend, isDatalabConfigured, SearchTrendRequest } from "@/lib/backend/naverDatalab";
import { guardApi } from "@/lib/backend/auth/guard";

const TIME_UNITS = ["date", "week", "month"];

// 검색어 트렌드 조회 프록시 — Client ID/Secret이 브라우저에 노출되지 않도록 서버에서만 호출한다.
// 조회·갱신 요청이라 읽기 권한으로 충분하다(viewer도 화면의 배지·차트를 볼 수 있어야 한다).
export async function POST(request: NextRequest) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 필요합니다." }, { status: 400 });
  }
  if (typeof body.startDate !== "string" || typeof body.endDate !== "string" || !TIME_UNITS.includes(body.timeUnit)) {
    return NextResponse.json({ error: "startDate, endDate, timeUnit(date|week|month)이 필요합니다." }, { status: 400 });
  }
  const groups: unknown = body.keywordGroups;
  if (
    !Array.isArray(groups) ||
    groups.length < 1 ||
    groups.length > 5 ||
    !groups.every(
      (g) =>
        g &&
        typeof g.groupName === "string" &&
        g.groupName.trim() &&
        Array.isArray(g.keywords) &&
        g.keywords.length >= 1 &&
        g.keywords.length <= 20 &&
        g.keywords.every((k: unknown) => typeof k === "string" && k.trim())
    )
  ) {
    return NextResponse.json({ error: "keywordGroups는 1~5개, 그룹당 검색어 1~20개여야 합니다." }, { status: 400 });
  }

  const payload: SearchTrendRequest = {
    startDate: body.startDate,
    endDate: body.endDate,
    timeUnit: body.timeUnit,
    keywordGroups: groups,
    device: body.device === "pc" || body.device === "mo" ? body.device : undefined,
    gender: body.gender === "m" || body.gender === "f" ? body.gender : undefined,
    ages: Array.isArray(body.ages) ? body.ages.filter((a: unknown): a is string => typeof a === "string") : undefined,
  };

  try {
    return NextResponse.json({ result: await fetchSearchTrend(payload) });
  } catch (error) {
    if (error instanceof DatalabError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

// 연동 여부 확인(키 존재만 알려 주고 값은 내보내지 않는다).
export async function GET() {
  const denied = await guardApi("read");
  if (denied) return denied;
  return NextResponse.json({ configured: isDatalabConfigured() });
}
