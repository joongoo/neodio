import { getPromptStore } from "./database";
import { DEFAULT_ORG_ID } from "@/lib/db";
import { PageSpeedResult } from "@/lib/db/types";

// PageSpeed Insights 결과 캐시 — Lighthouse 실행에 5~10초가 걸리고 쿼터도
// 쓰므로, URL별 마지막 결과를 남겨 "재확인" 버튼을 눌러야만 다시 호출한다.
// bridge_entries(조직/스코프/키 기반 범용 저장소)를 재사용 — 예전엔
// .tmp/*.json 파일로 뒀는데 Vercel의 읽기 전용 파일시스템에서 mkdir
// ENOENT로 깨졌다.
const SCOPE = "pagespeed-insights";

// url만으로 키를 잡으면 같은 URL의 mobile/desktop 결과가 서로 덮어쓴다 —
// strategy까지 합쳐서 키를 만든다.
function cacheKey(url: string, strategy: PageSpeedResult["strategy"]): string {
  return `${url}::${strategy}`;
}

/** 화면은 전부 mobile 기준 하나만 보여주므로, url 하나당 mobile 결과만 골라 반환한다. */
export async function getCachedPageSpeedResults(
  strategy: PageSpeedResult["strategy"] = "mobile"
): Promise<Record<string, PageSpeedResult>> {
  const store = await getPromptStore();
  const all = await store.bridgeScope<PageSpeedResult>(DEFAULT_ORG_ID, SCOPE);
  const byUrl: Record<string, PageSpeedResult> = {};
  for (const result of Object.values(all)) {
    if (result.strategy === strategy) byUrl[result.url] = result;
  }
  return byUrl;
}

export async function setCachedPageSpeedResult(url: string, result: PageSpeedResult): Promise<void> {
  const store = await getPromptStore();
  await store.putBridge(DEFAULT_ORG_ID, SCOPE, { [cacheKey(url, result.strategy)]: result });
}
