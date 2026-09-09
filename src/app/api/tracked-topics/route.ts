import { NextRequest, NextResponse } from "next/server";
import { deleteTrackedTopic, saveLibraryRow, trackTopic, updateLibraryRow } from "@/lib/backend/trackedTopics";
import { markLibraryRowDeleted } from "@/lib/backend/deletedLibraryRows";

const VALID_ORIGINS = new Set(["manual", "ai_generated", "csv_import"]);
// 실 파일로 저장된 행(추적/수동 추가/CSV 가져오기 전부 이 형식)만 수정 가능.
const ID_PATTERN = /^tracked-\d+-[a-z0-9]+$/;
// mock 시드 행 id — 코드에 박혀있는 데이터라 파일이 없다. 삭제 시 "삭제된
// id 목록"에 기록해서 다음 로드부터 걸러낸다(markLibraryRowDeleted).
const SEED_ID_PATTERN = /^pl-[a-z0-9-]+$/i;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const subcategory = typeof body?.subcategory === "string" ? body.subcategory.trim() : undefined;

  if (!prompt || !category) {
    return NextResponse.json({ error: "프롬프트와 카테고리가 모두 필요합니다." }, { status: 400 });
  }

  // origin이 명시되면(프롬프트 라이브러리의 "프롬프트 추가"/"CSV 가져오기"가
  // 보낸 것) 그 행을 그대로 저장한다 — 프롬프트 전략/가시성 개요의 "추적"
  // 흐름과 달리 topic/source 기반 서브카테고리 조립이 필요 없다.
  const origin = typeof body?.origin === "string" && VALID_ORIGINS.has(body.origin) ? body.origin : undefined;
  if (origin) {
    const row = await saveLibraryRow({
      prompt,
      origin: origin as "manual" | "ai_generated" | "csv_import",
      category,
      subcategory: subcategory || "—",
      lastModifiedAt: new Date().toISOString().slice(0, 10),
      lastModifiedBy: "나",
    });
    return NextResponse.json({ ok: true, row });
  }

  const topic = typeof body?.topic === "string" ? body.topic.trim() : undefined;
  const source = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "추적";
  const row = await trackTopic(prompt, category, { topicName: topic, subcategoryOverride: subcategory, source });
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (ID_PATTERN.test(id)) {
    await deleteTrackedTopic(id);
    return NextResponse.json({ ok: true });
  }
  if (SEED_ID_PATTERN.test(id)) {
    await markLibraryRowDeleted(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "삭제할 수 없는 id입니다." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "수정할 수 없는 id입니다." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const subcategory = typeof body?.subcategory === "string" ? body.subcategory.trim() : "—";
  if (!prompt || !category) {
    return NextResponse.json({ error: "프롬프트와 카테고리가 모두 필요합니다." }, { status: 400 });
  }
  const row = await updateLibraryRow(id, { prompt, category, subcategory });
  if (!row) return NextResponse.json({ error: "해당 프롬프트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, row });
}
