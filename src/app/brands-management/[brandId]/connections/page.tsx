import { ArrowLeft } from "lucide-react";
import { GscConnectionCard } from "@/components/brands-management/GscConnectionCard";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getGscToken } from "@/lib/backend/gscTokenStore";

// GSC 토큰이 방금 연결/해제됐을 수 있으므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function BrandConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ gsc_connected?: string; gsc_error?: string }>;
}) {
  const { brandId } = await params;
  const query = await searchParams;
  const [brand, gscMock, gscToken] = await Promise.all([
    db.brandsManagement.getBrand(DEFAULT_ORG_ID, brandId),
    db.connections.getGsc(brandId),
    getGscToken(brandId),
  ]);
  if (!brand) return null;

  // 실 OAuth 연결(.tmp/gsc-tokens)이 있으면 그걸로 대체 — 개요 등 다른
  // 페이지의 "실 데이터가 mock을 이긴다" 패턴과 동일.
  const gsc = gscToken
    ? {
        brandId,
        status: "connected" as const,
        accountEmail: gscToken.accountEmail,
        property: gscToken.property,
        lastSyncedAt: gscToken.connectedAt,
        syncedQueries: gscMock?.syncedQueries ?? 0,
        syncedImpressions: gscMock?.syncedImpressions ?? 0,
        syncedClicks: gscMock?.syncedClicks ?? 0,
      }
    : gscMock;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <a href={`/brands-management/${brand.id}`} className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        {brand.name}(으)로 돌아가기
      </a>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">연결 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          <b>{brand.name}</b>의 Google Search Console 연동 상태를 확인하세요.
        </p>
      </div>

      {query.gsc_connected && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Google Search Console이 연결됐습니다.</div>
      )}
      {query.gsc_error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          연결에 실패했습니다: {query.gsc_error === "no_refresh_token" ? "이미 연결된 적이 있어 재동의가 필요합니다. Google 계정 설정에서 이 앱의 액세스 권한을 제거한 뒤 다시 시도하세요." : query.gsc_error}
        </div>
      )}

      <GscConnectionCard gsc={gsc} brandId={brandId} />
    </div>
  );
}
