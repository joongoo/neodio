// 조직 하나(브랜드 + YouTube AIO 수집 데이터)를 로컬 Postgres에서 원격(운영)
// Postgres로 옮긴다. 원격에 이미 있는 것은 덮어쓰지 않고 없는 것만 넣으므로
// 여러 번 실행해도 안전하다. 기본은 미리보기(--dry-run)로 돌려 보고, 확인 후
// --apply로 실제 반영한다. 전체가 한 트랜잭션이라 실패하면 아무것도 바뀌지 않는다.
//
//   SOURCE_POSTGRES_URL=<로컬> POSTGRES_URL=<운영> npx tsx scripts/sync-org-to-remote.ts --org Salesforce [--apply] [--include-failed]
//
// 옮기는 것: 조직(이름으로 대조), 조직의 브랜드(이름으로 대조), 브랜드의 YouTube 채널·AIO 설정·
// AIO 키워드(정규화 키워드로 대조)·관측·인용·영상 최적화 이력, 인용된 영상 메타 캐시.
// 옮기지 않는 것: 스크린샷/HTML 파일 경로(수집한 PC에만 있는 파일이라 원격에선 비움),
// 실패(캡차 등) 관측(--include-failed로 포함), 프롬프트·카테고리 등 AI 가시성 데이터
// (있으면 경고만 — 그쪽은 scripts/sync-local-to-remote.ts).
import { Pool, PoolClient } from "pg";
import { PromptStore } from "../src/lib/backend/database/store";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

type Row = Record<string, unknown>;

async function main() {
  const orgName = argValue("org");
  const apply = process.argv.includes("--apply");
  const includeFailed = process.argv.includes("--include-failed");
  const sourceUrl = process.env.SOURCE_POSTGRES_URL;
  const targetUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!orgName) throw new Error("--org <조직 이름>이 필요합니다.");
  if (!sourceUrl || !targetUrl) throw new Error("SOURCE_POSTGRES_URL(로컬)과 POSTGRES_URL(원격)이 필요합니다.");
  if (sourceUrl === targetUrl) throw new Error("원본과 대상이 같은 DB입니다.");

  const source = new Pool({ connectionString: sourceUrl });
  const targetPool = new Pool({ connectionString: targetUrl });
  // 원격 스키마를 최신으로(새 테이블 생성) — 앱과 같은 초기화(advisory lock 포함).
  await new PromptStore(targetPool).init();

  const q = async <T extends Row = Row>(sql: string, params: unknown[] = []) => (await source.query(sql, params)).rows as T[];
  const [org] = await q<{ id: string; name: string; slug: string | null }>("SELECT id,name,slug FROM organizations WHERE name=$1", [orgName]);
  if (!org) throw new Error(`로컬에 "${orgName}" 조직이 없습니다.`);

  const aiVisibility = await q<{ n: number }>(
    "SELECT (SELECT count(*) FROM prompts WHERE organization_id=$1)+(SELECT count(*) FROM prompt_runs WHERE organization_id=$1) AS n",
    [org.id]
  );
  if (Number(aiVisibility[0].n) > 0) console.warn(`⚠ 이 조직의 프롬프트/수집 실행 ${aiVisibility[0].n}건은 이 스크립트로 옮기지 않습니다.`);

  const client: PoolClient = await targetPool.connect();
  const counts: Record<string, number> = {};
  const add = (key: string, n: number) => (counts[key] = (counts[key] ?? 0) + n);
  try {
    await client.query("BEGIN");
    const t = async <T extends Row = Row>(sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows as T[];
    const exec = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rowCount ?? 0;

    // 조직 — 원격에 같은 이름이 있으면 그 조직으로, 없으면 로컬 id 그대로 만든다.
    const [remoteOrg] = await t<{ id: string }>("SELECT id FROM organizations WHERE name=$1", [org.name]);
    const orgId = remoteOrg?.id ?? org.id;
    // 슬러그(URL의 조직 자리)도 같이 — 원격에서 이미 쓰는 슬러그면 비워 두고 앱 초기화가 채우게 한다.
    const [slugTaken] = org.slug ? await t("SELECT 1 FROM organizations WHERE slug=$1", [org.slug]) : [];
    if (!remoteOrg) {
      add("조직", await exec("INSERT INTO organizations (id,name,slug) VALUES ($1,$2,$3)", [orgId, org.name, slugTaken ? null : org.slug]));
    }

    const brands = await q("SELECT * FROM brands WHERE organization_id=$1", [org.id]);
    for (const brand of brands) {
      const [remoteBrand] = await t<{ id: string }>("SELECT id FROM brands WHERE organization_id=$1 AND name=$2", [orgId, brand.name]);
      const brandId = remoteBrand?.id ?? (brand.id as string);
      if (!remoteBrand) {
        add(
          "브랜드",
          await exec(
            "INSERT INTO brands VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
            [
              brandId, orgId, brand.name, brand.url, brand.sitemap_url, brand.description, brand.industry, brand.status,
              JSON.stringify(brand.markets_json), JSON.stringify(brand.aliases_json), JSON.stringify(brand.other_brands_json),
              JSON.stringify(brand.urls_json), JSON.stringify(brand.social_accounts_json), JSON.stringify(brand.earned_content_sources_json),
              brand.cdn_connected, brand.gsc_connected, brand.analytics_connected, brand.created_at, brand.updated_at,
            ]
          )
        );
      }

      for (const c of await q("SELECT * FROM brand_youtube_channels WHERE brand_id=$1", [brand.id])) {
        add("YouTube 채널", await exec(
          "INSERT INTO brand_youtube_channels (brand_id,channel_id,handle,title,thumbnail_url,added_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [brandId, c.channel_id, c.handle, c.title, c.thumbnail_url, c.added_at]
        ));
      }
      for (const s of await q("SELECT * FROM brand_aio_settings WHERE brand_id=$1", [brand.id])) {
        add("AIO 설정", await exec(
          "INSERT INTO brand_aio_settings (brand_id,country,language,devices_json,optimization_date,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [brandId, s.country, s.language, JSON.stringify(s.devices_json), s.optimization_date, s.updated_at]
        ));
      }

      // 키워드 — 정규화 키워드로 대조해 로컬 id → 원격 id
      const keywordMap = new Map<string, string>();
      for (const k of await q("SELECT * FROM aio_keywords WHERE brand_id=$1", [brand.id])) {
        const [existing] = await t<{ id: string }>("SELECT id FROM aio_keywords WHERE brand_id=$1 AND normalized_keyword=$2", [brandId, k.normalized_keyword]);
        if (existing) keywordMap.set(k.id as string, existing.id);
        else {
          add("AIO 키워드", await exec(
            "INSERT INTO aio_keywords (id,brand_id,keyword,normalized_keyword,keyword_group,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
            [k.id, brandId, k.keyword, k.normalized_keyword, k.keyword_group, k.status, k.created_at]
          ));
          keywordMap.set(k.id as string, k.id as string);
        }
      }

      // 관측 + 인용 — 원격에 같은 키워드·디바이스·날짜 관측이 있으면 원격을 둔다(하루 1건 규칙).
      const observations = await q(
        `SELECT * FROM aio_observations WHERE brand_id=$1 ${includeFailed ? "" : "AND status<>'failed'"} ORDER BY collected_at`,
        [brand.id]
      );
      const videoIds = new Set<string>();
      for (const o of observations) {
        const keywordId = keywordMap.get(o.keyword_id as string);
        if (!keywordId) continue;
        const [clash] = await t("SELECT id FROM aio_observations WHERE keyword_id=$1 AND device=$2 AND collected_date=$3", [keywordId, o.device, o.collected_date]);
        if (clash) {
          add("관측(원격에 이미 있어 건너뜀)", 1);
          continue;
        }
        add("AIO 관측", await exec(
          `INSERT INTO aio_observations (id,brand_id,keyword_id,device,country,language,collected_at,collected_date,status,aio_text,
             paragraphs_json,screenshot_path,html_path,error_message,has_youtube,has_own_video,own_best_position,source_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,$12,$13,$14,$15,$16)`,
          [
            o.id, brandId, keywordId, o.device, o.country, o.language, o.collected_at, o.collected_date, o.status, o.aio_text,
            JSON.stringify(o.paragraphs_json), o.error_message, o.has_youtube, o.has_own_video, o.own_best_position, o.source_count,
          ]
        ));
        for (const c of await q("SELECT * FROM aio_citations WHERE observation_id=$1", [o.id])) {
          add("인용", await exec(
            "INSERT INTO aio_citations (observation_id,position,url,domain,title,source_type,video_id,channel_id,start_seconds) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [o.id, c.position, c.url, c.domain, c.title, c.source_type, c.video_id, c.channel_id, c.start_seconds]
          ));
          if (c.video_id) videoIds.add(c.video_id as string);
        }
      }
      for (const log of await q("SELECT * FROM aio_video_work_logs WHERE brand_id=$1", [brand.id])) {
        add("최적화 작업 이력", await exec(
          "INSERT INTO aio_video_work_logs (id,brand_id,video_id,work_date,work_type,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
          [log.id, brandId, log.video_id, log.work_date, log.work_type, log.note, log.created_at]
        ));
      }
      for (const v of await q("SELECT * FROM youtube_videos WHERE video_id = ANY($1)", [[...videoIds]])) {
        add("영상 메타 캐시", await exec(
          "INSERT INTO youtube_videos (video_id,channel_id,title,thumbnail_url,fetched_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [v.video_id, v.channel_id, v.title, v.thumbnail_url, v.fetched_at]
        ));
      }
    }

    if (apply) await client.query("COMMIT");
    else await client.query("ROLLBACK");
    console.log(`${apply ? "✓ 반영 완료" : "미리보기(반영 안 함) — 실제로 옮기려면 --apply"}: "${org.name}" → 원격 조직 ${orgId}`);
    console.table(Object.keys(counts).length ? counts : { 변경: "없음(이미 모두 있음)" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await source.end();
    await targetPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
