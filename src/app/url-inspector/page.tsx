import { UrlInspectorClient } from "@/components/url-inspector/UrlInspectorClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealUrlInspectorData } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getRegisteredUrls } from "@/lib/backend/registeredUrls";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function UrlInspectorPage() {
  const [demo, data, registeredUrls] = await Promise.all([
    isDemoMode(),
    db.urlInspector.get(DEFAULT_ORG_ID),
    getRegisteredUrls(DEFAULT_ORG_ID).catch(() => [] as string[]),
  ]);
  if (!data) return null;

  const real = demo ? null : await getRealUrlInspectorData().catch(() => null);
  const merged = real ?? data;

  // 아직 한 번도 인용 안 된 URL도 "추적하고 싶다"고 등록해두면 0건인 채로
  // 표에 남아있게 한다 — 실측 인용이 있는 URL만 보이던 것의 보완.
  const existingUrls = new Set(merged.ownUrls.map((u) => u.url));
  const extraRows = registeredUrls
    .filter((url) => !existingUrls.has(url))
    .map((url, i) => ({
      id: `registered-${i}`,
      url,
      citations: 0,
      citedPrompts: 0,
      citedPromptTitles: [],
      contentVisibility: null,
      category: "미분류",
      market: "—",
    }));

  return <UrlInspectorClient data={{ ...merged, ownUrls: [...merged.ownUrls, ...extraRows] }} />;
}
