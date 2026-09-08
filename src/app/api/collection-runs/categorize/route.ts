import { NextRequest, NextResponse } from "next/server";
import { categorizeRun } from "@/lib/backend/collectionRuns";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const dir = typeof body?.dir === "string" ? body.dir : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const subcategory = typeof body?.subcategory === "string" ? body.subcategory.trim() : "";

  if (!category) {
    return NextResponse.json({ error: "카테고리를 선택해주세요." }, { status: 400 });
  }

  try {
    await categorizeRun(dir, filename, category, subcategory);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
