import { ArrowLeft, Cloud, LineChart } from "lucide-react";
import { GscConnectionCard } from "@/components/brands-management/GscConnectionCard";
import { ComingSoonConnectionCard } from "@/components/brands-management/ComingSoonConnectionCard";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getGscToken } from "@/lib/backend/gscTokenStore";
import { isDemoMode } from "@/lib/backend/demoMode";
import { getManagedBrand } from "@/lib/backend/brandsManagementStore";

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
  const demo = await isDemoMode();
  const [brand, gscMock, gscToken] = await Promise.all([
    getManagedBrand(DEFAULT_ORG_ID, brandId),
    db.connections.getGsc(brandId),
    getGscToken(brandId),
  ]);
  if (!brand) return null;

  // 실 OAuth 연결(.tmp/gsc-tokens)이 있으면 그걸로 대체. mock(gscConnectionByBrand)
  // 은 "Demo" 브랜드에서만 쓴다 — 예전엔 실 연동이 없을 때 항상 mock의
  // status:"connected"로 폴백해서, 연결 해제를 눌러도(진짜 토큰이 없으니
  // 지울 것도 없이) 화면이 계속 "연결됨"으로 보이는 버그가 있었다. 실
  // OAuth가 생긴 지금은 토큰의 유무 자체가 연결 상태의 유일한 근거여야
  // 한다.
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
    : demo
      ? gscMock
      : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <a href={`/brands-management/${brand.id}`} className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        {brand.name}(으)로 돌아가기
      </a>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">연결 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          <b>{brand.name}</b>의 데이터 연동 상태를 확인하세요.
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
      <ComingSoonConnectionCard
        title="CDN"
        description="Edge/CDN 로그를 연결해 AI 에이전트 트래픽을 추적할 수 있습니다."
        icon={<Cloud size={18} className="text-neutral-500" />}
      />
      <ComingSoonConnectionCard
        title="Analytics"
        description="웹 분석 도구를 연결해 유입/전환 데이터를 함께 볼 수 있습니다."
        icon={<LineChart size={18} className="text-neutral-500" />}
      />
    </div>
  );
}
