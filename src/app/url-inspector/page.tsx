import { UrlInspectorClient } from "@/components/url-inspector/UrlInspectorClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealUrlInspectorData } from "@/lib/backend/collectionStatsReader";
import { isDemoMode } from "@/lib/backend/demoMode";

// 실 수집 데이터(.tmp/*-ai)가 새로 생길 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function UrlInspectorPage() {
  const [demo, data] = await Promise.all([isDemoMode(), db.urlInspector.get(DEFAULT_ORG_ID)]);
  if (!data) return null;

  const real = demo ? null : await getRealUrlInspectorData().catch(() => null);

  return <UrlInspectorClient data={real ?? data} />;
}
