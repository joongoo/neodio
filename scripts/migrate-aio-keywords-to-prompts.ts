// AIO 키워드 → 프롬프트 라이브러리 이관 (docs/prompt-surfaces-plan.md 1단계).
//   npm run db:aio-keywords-to-prompts                    # 로컬 DB 미리보기(아무것도 바꾸지 않는다)
//   npm run db:aio-keywords-to-prompts -- --apply         # 로컬 DB에 적용
//   npm run db:aio-keywords-to-prompts:prod               # 운영 DB 미리보기(.env.neon.local)
//   npm run db:aio-keywords-to-prompts:prod -- --apply    # 운영 DB에 적용
// 이미 옮긴 키워드는 건너뛰므로 다시 실행해도 안전하다. 운영에 적용하기 전에 꼭 미리보기 결과를 확인한다.
import { getPromptStore } from "../src/lib/backend/database";
import { migrateAioKeywordsToPrompts } from "../src/lib/backend/database/aioKeywordMigration";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("POSTGRES_URL이 필요합니다.");
  // 어느 DB에 하는지 눈으로 확인할 수 있게 호스트와 DB 이름만 보여 준다(비밀번호는 출력하지 않는다).
  const target = new URL(url);
  console.log(`대상 DB: ${target.host}${target.pathname} — ${apply ? "적용" : "미리보기(변경 없음)"}`);

  const store = await getPromptStore();
  const report = await migrateAioKeywordsToPrompts(store, { dryRun: !apply });
  await store.close();

  console.log(`옮길 AIO 키워드 ${report.keywords}개 (이미 옮김 ${report.alreadyMigrated}개)`);
  console.log(`  새 프롬프트 ${report.createdPrompts}개 / 라이브러리에 같은 문장이 있어 재사용 ${report.reusedPrompts.length}개`);
  console.log(`  추적 새로 만듦 ${report.trackingCreated} · 다시 켬 ${report.trackingReactivated} · 보관으로 만듦 ${report.trackingArchived}`);
  console.log(`  플랫폼이 없던 기존 추적에 기본 플랫폼(네이버 AI·Google AI 모드) 추가 ${report.defaultSurfacesAdded}개`);
  for (const reused of report.reusedPrompts) console.log(`  재사용: "${reused.keyword}" (${reused.organizationId})`);
  if (!apply) console.log("\n미리보기입니다. 반영하려면 --apply를 붙여 다시 실행하세요.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
