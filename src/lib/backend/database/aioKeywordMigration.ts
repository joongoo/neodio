import { AI_ANSWER_SURFACES } from "../../promptSurfaces";
import type { PromptStore } from "./store";

// AIO 키워드(aio_keywords)를 프롬프트 라이브러리(prompts + prompt_tracking)로 옮긴다 — 질의는 한 곳에서만 등록한다
// (docs/prompt-surfaces-plan.md). 키워드마다: 프롬프트를 만들거나(같은 문장이 이미 있으면 그 프롬프트를 쓰고 분류는 건드리지 않는다),
// 이 브랜드의 추적을 만들고, 추적에 Google AI Overview 플랫폼을 켜고, aio_keywords.prompt_id를 채운다.
// 이미 옮긴 키워드는 건너뛰므로 다시 실행해도 안전하다. 미리보기(dryRun)는 같은 작업을 하고 되돌린다.

export interface AioKeywordMigrationReport {
  dryRun: boolean;
  /** 이번에 옮긴 키워드 수 */
  keywords: number;
  /** 이미 옮겨져 건너뛴 키워드 수 */
  alreadyMigrated: number;
  createdPrompts: number;
  /** 라이브러리에 같은 문장이 이미 있어 그 프롬프트에 AIO 플랫폼만 켠 키워드 */
  reusedPrompts: { keyword: string; organizationId: string }[];
  trackingCreated: number;
  /** 보관·일시중지 상태였던 추적을 활성 키워드 때문에 다시 켠 수 */
  trackingReactivated: number;
  /** 보관 상태였던 키워드라 보관으로 만든 추적 수 */
  trackingArchived: number;
  /** 플랫폼이 하나도 없던 기존 추적에 기본 플랫폼(네이버 AI·Google AI 모드)을 붙인 수 */
  defaultSurfacesAdded: number;
}

class DryRunRollback extends Error {}

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
      const rows = await store.query<{ id: string }>("SELECT id FROM aio_keywords WHERE prompt_id IS NULL ORDER BY created_at,id");
      for (const { id } of rows) {
        const linked = await store.linkAioKeyword(id);
        if (!linked?.linked) continue;
        report.keywords += 1;
        if (linked.createdPrompt) report.createdPrompts += 1;
        else report.reusedPrompts.push({ keyword: linked.keyword, organizationId: linked.organizationId });
        if (linked.trackingCreated) report.trackingCreated += 1;
        if (linked.trackingReactivated) report.trackingReactivated += 1;
        if (linked.trackingArchived) report.trackingArchived += 1;
      }

      // 플랫폼이 하나도 없는 기존 추적 — 지금까지 실제로 수집하던 플랫폼(네이버 AI·Google AI 모드)을 기본으로 붙인다.
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
