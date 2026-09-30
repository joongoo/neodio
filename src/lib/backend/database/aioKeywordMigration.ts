import { AI_ANSWER_SURFACES, normalizeSurfaces } from "../../promptSurfaces";
import { normalize, type PromptStore } from "./store";

// AIO 키워드(aio_keywords)를 프롬프트 라이브러리(prompts + prompt_tracking)로 옮긴다 — 질의는 한 곳에서만 등록한다
// (docs/prompt-surfaces-plan.md). 키워드마다: 프롬프트를 만들거나(같은 문장이 이미 있으면 그 프롬프트를 쓰고 분류는 건드리지 않는다),
// 이 브랜드의 추적을 만들고, 추적에 Google AI Overview 표면을 켜고, aio_keywords.prompt_id를 채운다.
// 이미 옮긴 키워드는 건너뛰므로 다시 실행해도 안전하다. 미리보기(dryRun)는 같은 작업을 하고 되돌린다.

/** 기존 키워드 그룹 4종의 행방 — 비교/How-to는 검색 의도로, 브랜드/카테고리는 토픽으로 옮긴다. */
const GROUP_MAPPING: Record<string, { topic?: string; searchIntent?: string }> = {
  comparison: { searchIntent: "업체 비교" },
  howto: { searchIntent: "정보 탐색" },
  brand: { topic: "브랜드 키워드" },
  category: { topic: "카테고리 키워드" },
};

export interface AioKeywordMigrationReport {
  dryRun: boolean;
  /** 이번에 옮긴 키워드 수 */
  keywords: number;
  /** 이미 옮겨져 건너뛴 키워드 수 */
  alreadyMigrated: number;
  createdPrompts: number;
  /** 라이브러리에 같은 문장이 이미 있어 그 프롬프트에 AIO 표면만 켠 키워드 */
  reusedPrompts: { keyword: string; organizationId: string }[];
  trackingCreated: number;
  /** 보관·일시중지 상태였던 추적을 활성 키워드 때문에 다시 켠 수 */
  trackingReactivated: number;
  /** 보관 상태였던 키워드라 보관으로 만든 추적 수 */
  trackingArchived: number;
  /** 표면이 하나도 없던 기존 추적에 기본 표면(네이버 AI·Google AI 모드)을 붙인 수 */
  defaultSurfacesAdded: number;
}

class DryRunRollback extends Error {}

interface KeywordRow {
  id: string;
  brand_id: string;
  keyword: string;
  keyword_group: string;
  status: "active" | "archived";
  organization_id: string;
}

export async function migrateAioKeywordsToPrompts(store: PromptStore, options: { dryRun: boolean }): Promise<AioKeywordMigrationReport> {
  const report: AioKeywordMigrationReport = {
    dryRun: options.dryRun,
    keywords: 0,
    alreadyMigrated: 0,
    createdPrompts: 0,
    reusedPrompts: [],
    trackingCreated: 0,
    trackingReactivated: 0,
    trackingArchived: 0,
    defaultSurfacesAdded: 0,
  };
  try {
    await store.transaction(async () => {
      report.alreadyMigrated = (await store.query<{ n: number }>("SELECT count(*)::int AS n FROM aio_keywords WHERE prompt_id IS NOT NULL"))[0].n;
      const rows = await store.query<KeywordRow>(
        `SELECT k.id,k.brand_id,k.keyword,k.keyword_group,k.status,b.organization_id FROM aio_keywords k
         JOIN brands b ON b.id=k.brand_id WHERE k.prompt_id IS NULL ORDER BY k.created_at,k.id`
      );
      for (const row of rows) {
        const orgId = row.organization_id;
        const existingPrompt = (await store.query<{ id: string }>("SELECT id FROM prompts WHERE organization_id=$1 AND normalized_text=$2", [orgId, normalize(row.keyword)]))[0];
        const mapping = GROUP_MAPPING[row.keyword_group] ?? {};
        // 이미 있는 프롬프트의 분류(토픽·검색 의도)는 덮어쓰지 않는다.
        const promptId = await store.upsertPrompt(orgId, {
          text: row.keyword,
          sourceType: "aio-keyword",
          sourceKey: row.id,
          ...(existingPrompt ? {} : { topic: mapping.topic, searchIntent: mapping.searchIntent }),
        });
        if (existingPrompt) report.reusedPrompts.push({ keyword: row.keyword, organizationId: orgId });
        else report.createdPrompts += 1;

        const before = (await store.query<{ id: string; status: string }>(
          "SELECT id,status FROM prompt_tracking WHERE organization_id=$1 AND prompt_id=$2 AND brand_id=$3", [orgId, promptId, row.brand_id]))[0];
        let trackingId = before?.id;
        if (row.status === "active" || !before) {
          const tracked = await store.track(orgId, { text: row.keyword }, { brandId: row.brand_id, origin: "manual" });
          trackingId = tracked.id;
          if (!before) report.trackingCreated += 1;
          else if (before.status !== "active") report.trackingReactivated += 1;
          if (row.status === "archived") {
            await store.setTrackingStatus(orgId, tracked.id, "archived");
            report.trackingArchived += 1;
          }
        }
        const surfaces = (await store.trackingSurfaces(orgId, [trackingId!])).get(trackingId!) ?? [];
        await store.setTrackingSurfaces(orgId, trackingId!, normalizeSurfaces([...surfaces, "google-aio"]));
        await store.query("UPDATE aio_keywords SET prompt_id=$1 WHERE id=$2", [promptId, row.id]);
        report.keywords += 1;
      }

      // 표면이 하나도 없는 기존 추적 — 지금까지 실제로 수집하던 표면(네이버 AI·Google AI 모드)을 기본으로 붙인다.
      const bare = await store.query<{ id: string; organization_id: string }>(
        `SELECT t.id,t.organization_id FROM prompt_tracking t
         WHERE t.status <> 'archived' AND NOT EXISTS (SELECT 1 FROM prompt_tracking_surfaces s WHERE s.tracking_id=t.id)`
      );
      for (const tracking of bare) {
        await store.setTrackingSurfaces(tracking.organization_id, tracking.id, AI_ANSWER_SURFACES);
        report.defaultSurfacesAdded += 1;
      }
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return report;
}
