import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentUser } from "@/lib/backend/auth/session";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { buildReportSnapshot } from "@/lib/backend/reportBuilder";
import { createReport, listReports, ReportError } from "@/lib/backend/reportStore";
import { parseFilters } from "@/lib/filterOptions";
import { defaultSections, RANGE_LABEL, type ReportRange } from "@/lib/report";

// 리포트 목록 조회와 생성 — 생성하는 순간의 지표를 고정(스냅샷)해 저장한다.
export async function GET() {
  const denied = await guardApi("read");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  return NextResponse.json({ reports: tenant.brandId ? await listReports(tenant.orgId, tenant.brandId) : [] });
}

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  if (!tenant.brand) return NextResponse.json({ error: "브랜드가 없어 보고서를 만들 수 없어요." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const range: ReportRange = body?.range === "1w" || body?.range === "2w" ? body.range : "4w";
  const parsed = parseFilters({ range, market: body?.market, model: body?.model, scope: body?.scope });
  const filterLabels = { market: parsed.marketLabel, model: parsed.modelLabel, scope: parsed.scopeLabel };

  const snapshot = await buildReportSnapshot({ orgId: tenant.orgId, brand: tenant.brand, range, filters: parsed.filters, filterLabels });
  if (!snapshot.kpis) return NextResponse.json({ error: "선택한 조건에 맞는 수집 데이터가 없어 보고서를 만들 수 없어요." }, { status: 400 });
  const title = typeof body?.title === "string" && body.title.trim() ? body.title : `${tenant.brand.name} AI 가시성 리포트 (${RANGE_LABEL[range]})`;
  try {
    const report = await createReport(tenant.orgId, tenant.brand.id, {
      title, range, filters: filterLabels, snapshot, sections: defaultSections(snapshot), createdBy: (await getCurrentUser())?.id ?? null,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
