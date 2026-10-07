import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { deleteReport, finalizeReport, getReport, ReportError, updateReport } from "@/lib/backend/reportStore";
import type { ReportSections } from "@/lib/report";

function errorResponse(error: unknown) {
  if (error instanceof ReportError) return NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : error.code === "locked" ? 409 : 400 });
  throw error;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi("read");
  if (denied) return denied;
  const report = await getReport((await getCurrentTenant()).orgId, (await params).id);
  if (!report) return NextResponse.json({ error: "보고서를 찾을 수 없어요." }, { status: 404 });
  // 보고서는 브랜드에 속한다 — 다른 브랜드의 보고서를 id로 열지 못하게 그 브랜드 기준으로 다시 검사한다.
  const brandDenied = await guardApi("read", { brandId: report.brandId });
  return brandDenied ?? NextResponse.json({ report });
}

// 수정(제목·섹션 코멘트·포함 여부) 또는 확정(status: "final")
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const { id } = await params;
  const existing = await getReport(tenant.orgId, id);
  if (existing) {
    const brandDenied = await guardApi("write", { brandId: existing.brandId });
    if (brandDenied) return brandDenied;
  }
  const body = await request.json().catch(() => null);
  try {
    if (body?.status === "final") return NextResponse.json({ report: await finalizeReport(tenant.orgId, id) });
    return NextResponse.json({ report: await updateReport(tenant.orgId, id, { title: body?.title, sections: body?.sections as ReportSections | undefined }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const tenant = await getCurrentTenant();
  const { id } = await params;
  const existing = await getReport(tenant.orgId, id);
  if (existing) {
    const brandDenied = await guardApi("write", { brandId: existing.brandId });
    if (brandDenied) return brandDenied;
  }
  const ok = await deleteReport(tenant.orgId, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "보고서를 찾을 수 없어요." }, { status: 404 });
}
