import { NextRequest, NextResponse } from "next/server";
import { deleteTrackedTopic, saveLibraryRow, trackTopic, updateLibraryRow } from "@/lib/backend/trackedTopics";
import { markLibraryRowDeleted } from "@/lib/backend/deletedLibraryRows";

import { getPromptStore } from "@/lib/backend/database";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { normalizeSurfaces } from "@/lib/promptSurfaces";

const VALID_ORIGINS = new Set(["manual", "ai_generated", "csv_import"]);
// 실 파일로 저장된 행(추적/수동 추가/CSV 가져오기 전부 이 형식)만 수정 가능.
const ID_PATTERN = /^tracked-\d+-[a-z0-9]+$/;
// mock 시드 행 id — 코드에 박혀있는 데이터라 파일이 없다. 삭제 시 "삭제된
// id 목록"에 기록해서 다음 로드부터 걸러낸다(markLibraryRowDeleted).
const SEED_ID_PATTERN = /^pl-[a-z0-9-]+$/i;

export async function POST(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const body = await request.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : undefined;
  const origin = typeof body?.origin === "string" && VALID_ORIGINS.has(body.origin) ? body.origin : undefined;
  // 수집 표면 — 안 보내면 기본값(지금까지 수집하던 표면), 보냈다면 하나 이상이어야 한다.
  const surfaces = Array.isArray(body?.surfaces) ? normalizeSurfaces(body.surfaces) : undefined;
  if (surfaces && surfaces.length === 0) return NextResponse.json({ error: "수집 표면을 하나 이상 선택하세요." }, { status: 400 });

  if (!prompt || (!category && origin !== "csv_import")) {
    return NextResponse.json({ error: "프롬프트와 카테고리가 모두 필요합니다." }, { status: 400 });
  }

  // origin이 명시되면(프롬프트 라이브러리의 "프롬프트 추가"/"CSV 가져오기"가
  // 보낸 것) 그 행을 그대로 저장한다 — 프롬프트 전략/가시성 개요의 "추적"
  // 흐름과 달리 source 기반 기본값 조립이 필요 없다.
  if (origin) {
    const row = await saveLibraryRow(tenant.orgId, tenant.brandId, {
      prompt,
      origin: origin as "manual" | "ai_generated" | "csv_import",
      category,
      topic: topic || "—",
      lastModifiedAt: new Date().toISOString().slice(0, 10),
      lastModifiedBy: "나",
    }, {}, { surfaces });
    return NextResponse.json({ ok: true, row });
  }

  const source = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "추적";
  const row = await trackTopic(tenant.orgId, tenant.brandId, prompt, category, { topic, source,
    intent: typeof body?.intent === "string" ? body.intent : undefined,
    reasoning: typeof body?.reasoning === "string" ? body.reasoning : undefined,
    purpose: typeof body?.purpose === "string" ? body.purpose : undefined,
  });
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (ID_PATTERN.test(id)) {
    await deleteTrackedTopic(tenant.orgId, id);
    return NextResponse.json({ ok: true });
  }
  if (SEED_ID_PATTERN.test(id)) {
    await markLibraryRowDeleted(tenant.orgId, id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "삭제할 수 없는 id입니다." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const tenant = await getCurrentTenant();
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!ID_PATTERN.test(id) && !SEED_ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "수정할 수 없는 id입니다." }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (body?.status === "active" || body?.status === "paused" || body?.status === "archived") {
    const found = await (await getPromptStore()).setTrackingStatus(tenant.orgId, id, body.status);
    return NextResponse.json(found ? { ok: true } : { error: "해당 프롬프트를 찾을 수 없습니다." }, { status: found ? 200 : 404 });
  }
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "—";
  // 수집 표면 바꾸기 — 내용(프롬프트·카테고리)과 함께 보내도 되고 표면만 보내도 된다.
  if (Array.isArray(body?.surfaces)) {
    const surfaces = normalizeSurfaces(body.surfaces);
    if (surfaces.length === 0) return NextResponse.json({ error: "수집 표면을 하나 이상 선택하세요." }, { status: 400 });
    const changed = await (await getPromptStore()).setTrackingSurfaces(tenant.orgId, id, surfaces);
    if (!changed) return NextResponse.json({ error: "해당 프롬프트를 찾을 수 없습니다." }, { status: 404 });
    if (!prompt && !category) return NextResponse.json({ ok: true, surfaces });
  }
  if (!prompt || !category) {
    return NextResponse.json({ error: "프롬프트와 카테고리가 모두 필요합니다." }, { status: 400 });
  }
  let row;
  try {
    row = await updateLibraryRow(tenant.orgId, id, { prompt, category, topic });
  } catch (error) {
    if (error instanceof Error && error.message === "An identical prompt already exists") {
      return NextResponse.json({ error: "동일한 프롬프트가 이미 존재합니다." }, { status: 409 });
    }
    throw error;
  }
  if (!row) return NextResponse.json({ error: "해당 프롬프트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, row });
}
