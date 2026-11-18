import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/backend/auth/guard";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { saveLibraryRow } from "@/lib/backend/trackedTopics";
import type { PromptLibraryRow } from "@/lib/db/types";

export async function POST(request: NextRequest) {
  const denied = await guardApi("write");
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.rows) || body.rows.length < 1 || body.rows.length > 25 ||
      body.rows.some((row: unknown) => !row || typeof row !== "object" ||
        !("prompt" in row) || typeof row.prompt !== "string" || !row.prompt.trim() ||
        !("category" in row) || typeof row.category !== "string" ||
        !("topic" in row) || typeof row.topic !== "string")) {
    return NextResponse.json({ error: "프롬프트를 1~25개씩 보내 주세요." }, { status: 400 });
  }
  const tenant = await getCurrentTenant();
  const rows: PromptLibraryRow[] = [];
  try {
    for (const row of body.rows) {
      rows.push(await saveLibraryRow(tenant.orgId, tenant.brandId, {
        prompt: row.prompt.trim(), category: row.category.trim(), topic: row.topic.trim() || "—",
        origin: "csv_import", lastModifiedAt: null, lastModifiedBy: null,
      }));
    }
  } catch (error) {
    console.error("CSV prompt import failed", error);
    return NextResponse.json({ ok: false, rows,
      error: "가져오기가 중단됐습니다. 저장된 항목은 유지됩니다. 다시 시도하면 이미 저장된 항목은 제외됩니다.",
    }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows });
}
