// YouTube AIO 인용 트래커 정기 수집 (docs/youtube-aio-tracker-plan.md).
// 채널이 연동된 활성 브랜드마다 runAioCollection(src/lib/backend/aio/
// collector.ts — 화면의 "지금 수집" 버튼과 같은 코드)을 돌린다. 이미 오늘
// 수집한 키워드×디바이스는 건너뛰므로 다시 실행해도 이어서 수집하고,
// 캡차가 뜨면 그날 수집은 거기서 멈춘다. 시스템 cron 예:
//   0 9 * * * cd /path/to/neodio && npm run collect:aio >> .tmp/collect-aio.log 2>&1
//
// 옵션: --brand <brandId>  --devices mobile,desktop  --limit N  --force
//       --min-delay-ms  --max-delay-ms  --keyword "<단일 키워드 테스트>"
import { getPromptStore } from "../src/lib/backend/database";
import { getManagedBrands } from "../src/lib/backend/brandsManagementStore";
import { runAioCollection } from "../src/lib/backend/aio/collector";
import { listAioKeywords } from "../src/lib/backend/aio/store";
import { AioDevice } from "../src/lib/db/types";

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return fallback;
}

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main() {
  const brandFilter = argValue("brand", "");
  const devices = argValue("devices", "")
    .split(",")
    .filter((d): d is AioDevice => d === "mobile" || d === "desktop");
  const limit = Number(argValue("limit", "0")) || undefined;
  const singleKeyword = argValue("keyword", "");

  // 모든 조직의 활성 브랜드 — 채널이 연동된 브랜드만 실제로 수집된다.
  const orgs = await (await getPromptStore()).listOrganizations();
  const brands = (await Promise.all(orgs.map((org) => getManagedBrands(org.id))))
    .flat()
    .filter((b) => b.status === "active" && (!brandFilter || b.id === brandFilter));
  for (const brand of brands) {
    const keywordIds = singleKeyword
      ? (await listAioKeywords(brand.id)).filter((k) => k.keyword === singleKeyword).map((k) => k.id)
      : undefined;
    const summary = await runAioCollection({
      brandId: brand.id,
      keywordIds,
      devices,
      force: process.argv.includes("--force"),
      limit,
      minDelayMs: Number(argValue("min-delay-ms", String(3 * 60_000))),
      maxDelayMs: Number(argValue("max-delay-ms", String(8 * 60_000))),
      onEvent: (event) => {
        if (event.type === "plan") log(`${brand.name}: 수집 대상 ${event.total}건 (${event.devices.join("/")}, 오늘 수집분 ${event.skipped}건 제외)`);
        if (event.type === "wait") log(`다음 요청까지 ${Math.round(event.ms / 1000)}초 대기`);
        if (event.type === "result") {
          log(
            `${event.status === "failed" ? "✗" : "✓"} "${event.keyword}" (${event.device}) ${event.status}` +
              (event.status === "aio_present"
                ? ` · 출처 ${event.sources} · YouTube ${event.youtube} · 우리 영상 ${event.ownPositions.length ? `${event.ownPositions.join(",")}위` : "없음"}`
                : "") +
              (event.message ? ` · ${event.message}` : "") +
              (event.saved ? "" : " · 오늘 성공한 결과가 있어 저장 안 함")
          );
        }
      },
    });
    if (summary.skippedReason) log(`${brand.name}: ${summary.skippedReason} — 건너뜀`);
    if (summary.captcha) {
      log("Google 캡차 — 오늘 수집을 중단합니다. 다음 실행 때 남은 키워드부터 이어서 수집합니다.");
      return;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
