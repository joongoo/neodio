import { randomUUID } from "node:crypto";
import { getPromptStore } from "./database";
import type { ReportRange, ReportSections, ReportSnapshot } from "@/lib/report";

// 리포트 저장소 — 생성 시점 지표(snapshot)를 고정해 둔다. 확정(final)한 보고서는 내용을 바꾸지 못한다. 서버 전용.

export interface ReportSummary {
  id: string;
  title: string;
  range: ReportRange;
  status: "draft" | "final";
  createdAt: string;
  finalizedAt: string | null;
  createdBy: string | null;
}

export interface Report extends ReportSummary {
  organizationId: string;
  brandId: string;
  filters: { market: string; model: string; scope: string };
  snapshot: ReportSnapshot;
  sections: ReportSections;
}

export class ReportError extends Error {
  constructor(message: string, readonly code: "invalid" | "locked" | "not_found" = "invalid") {
    super(message);
  }
}

const now = () => new Date().toISOString();

function toSummary(row: Record<string, unknown>): ReportSummary {
  return {
    id: row.id as string, title: row.title as string, range: row.range as ReportRange, status: row.status as "draft" | "final",
    createdAt: row.created_at as string, finalizedAt: (row.finalized_at as string | null) ?? null, createdBy: (row.created_by as string | null) ?? null,
  };
}

export async function createReport(orgId: string, brandId: string, input: {
  title: string; range: ReportRange; filters: Report["filters"]; snapshot: ReportSnapshot; sections: ReportSections; createdBy: string | null;
}): Promise<Report> {
  const title = input.title.trim();
  if (!title || title.length > 100) throw new ReportError("보고서 제목은 1~100자로 입력해주세요.");
  const store = await getPromptStore();
  const id = `report-${randomUUID()}`;
  const at = now();
  await store.query(
    `INSERT INTO neodio_reports(id,organization_id,brand_id,title,range,filters_json,snapshot_json,sections_json,status,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$10)`,
    [id, orgId, brandId, title, input.range, JSON.stringify(input.filters), JSON.stringify(input.snapshot), JSON.stringify(input.sections), input.createdBy, at]);
  return (await getReport(orgId, id))!;
}

export async function listReports(orgId: string, brandId: string): Promise<ReportSummary[]> {
  const rows = await (await getPromptStore()).query(
    "SELECT id,title,range,status,created_at,finalized_at,created_by FROM neodio_reports WHERE organization_id=$1 AND brand_id=$2 ORDER BY created_at DESC", [orgId, brandId]);
  return rows.map(toSummary);
}

export async function getReport(orgId: string, id: string): Promise<Report | null> {
  const [row] = await (await getPromptStore()).query("SELECT * FROM neodio_reports WHERE organization_id=$1 AND id=$2", [orgId, id]);
  if (!row) return null;
  return {
    ...toSummary(row), organizationId: row.organization_id as string, brandId: row.brand_id as string,
    filters: row.filters_json as Report["filters"], snapshot: row.snapshot_json as ReportSnapshot, sections: row.sections_json as ReportSections,
  };
}

/** 제목·섹션(포함 여부, 코멘트)을 바꾼다 — 확정한 보고서는 바꿀 수 없다. */
export async function updateReport(orgId: string, id: string, patch: { title?: string; sections?: ReportSections }): Promise<Report> {
  const current = await getReport(orgId, id);
  if (!current) throw new ReportError("보고서를 찾을 수 없어요.", "not_found");
  if (current.status === "final") throw new ReportError("확정한 보고서는 수정할 수 없어요. 새 보고서로 다시 만들어 주세요.", "locked");
  const title = patch.title === undefined ? current.title : patch.title.trim();
  if (!title || title.length > 100) throw new ReportError("보고서 제목은 1~100자로 입력해주세요.");
  const sections = patch.sections ?? current.sections;
  for (const state of Object.values(sections)) if (typeof state?.included !== "boolean" || typeof state.commentary !== "string" || state.commentary.length > 5000) throw new ReportError("섹션 내용이 올바르지 않아요.");
  await (await getPromptStore()).query("UPDATE neodio_reports SET title=$1,sections_json=$2,updated_at=$3 WHERE organization_id=$4 AND id=$5", [title, JSON.stringify(sections), now(), orgId, id]);
  return (await getReport(orgId, id))!;
}

export async function finalizeReport(orgId: string, id: string): Promise<Report> {
  const current = await getReport(orgId, id);
  if (!current) throw new ReportError("보고서를 찾을 수 없어요.", "not_found");
  if (current.status === "final") return current;
  const at = now();
  await (await getPromptStore()).query("UPDATE neodio_reports SET status='final',finalized_at=$1,updated_at=$1 WHERE organization_id=$2 AND id=$3", [at, orgId, id]);
  return (await getReport(orgId, id))!;
}

export async function deleteReport(orgId: string, id: string): Promise<boolean> {
  const rows = await (await getPromptStore()).query("DELETE FROM neodio_reports WHERE organization_id=$1 AND id=$2 RETURNING id", [orgId, id]);
  return rows.length > 0;
}
