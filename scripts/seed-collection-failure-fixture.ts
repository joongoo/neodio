import { getPromptStore } from "../src/lib/backend/database";
import { assignBrandSlugs } from "../src/lib/slug";
import { createMixedFailureFixture } from "../src/lib/backend/dataforseo/mixedFailureFixture";

async function main() {
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || process.env.DATAFORSEO_EXECUTOR !== "local") throw new Error("Fixture 생성은 DATAFORSEO_EXECUTOR=local인 개발 환경에서만 허용합니다.");
  const [orgSlug, brandSlug] = process.argv.slice(2);
  if (!orgSlug || !brandSlug) throw new Error("사용법: node --env-file=.env.local --import tsx scripts/seed-collection-failure-fixture.ts <조직 slug> <브랜드 slug>");
  const db = await getPromptStore();
  try {
    const org = (await db.listOrganizations()).find(item => item.slug === orgSlug);
    if (!org) throw new Error("조직을 찾을 수 없습니다.");
    const brands = await db.listBrands(org.id), slugs = assignBrandSlugs(brands);
    const brand = brands.find(item => slugs.get(item.id) === brandSlug);
    if (!brand) throw new Error("브랜드를 찾을 수 없습니다.");
    const requestId = await createMixedFailureFixture(org.id, brand.id);
    console.log(`Fixture: /${orgSlug}/${brandSlug}/collection-runs/${requestId}`);
    console.log("로컬 5건 + SERP API 4건, 실제 수집/API 호출 없음. 같은 명령 재실행 시 기존 fixture를 반환합니다.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
