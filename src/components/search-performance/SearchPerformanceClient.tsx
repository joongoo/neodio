"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { DataTable } from "@/components/ui/DataTable";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { GscConnection, GscSearchPerformanceResult } from "@/lib/db";

// Mirrors SearchTrendClient's shell (banner → chart), but the data source is
// GSC's own real property (docs/gsc-search-analytics-plan.md) rather than a
// keyword lookup — so the "not ready" state is "계정을 연결하세요", not an
// empty search box, and it links to the existing Manage Connections flow
// instead of duplicating a connect button here.
export function SearchPerformanceClient({
  brandName,
  gsc,
  performance,
  real,
}: {
  brandName: string;
  gsc: GscConnection | null;
  performance: GscSearchPerformanceResult | null;
  /** true only when `gsc`/`performance` came from an actual OAuth-connected
   *  account (src/app/api/connections/gsc/oauth) — false for the mock
   *  fallback (no connection yet, or "Demo" 브랜드). */
  real: boolean;
}) {
  const connected = gsc?.status === "connected";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">검색 성과 (Search Console)</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {brandName}의 Google Search Console 실측 노출·클릭 데이터를 확인합니다.
        </p>
      </div>

      {!connected && (
        <InfoBanner
          title="Google Search Console 연동 필요"
          description="계정을 연결하면 실제 검색 노출·클릭 데이터를 확인할 수 있습니다."
        />
      )}

      {connected && !real && (
        <InfoBanner
          title="화면 구조 검증용 mock 데이터입니다"
          description="실제 계정 연결 전까지는 아래 그래프·표가 mock 데이터로 표시됩니다."
        />
      )}

      {!performance ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm font-medium text-neutral-700">연결된 Search Console 데이터가 없습니다.</p>
          <p className="text-xs text-neutral-500">Manage Connections에서 계정을 연결하면 검색 성과 데이터를 볼 수 있습니다.</p>
          <a href="/brands-management/brand-neodigm/connections">
            <Button variant="primary">Manage Connections으로 이동</Button>
          </a>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <SimpleStatCard
              label="최근 주간 클릭 수"
              value={performance.trend[performance.trend.length - 1]?.clicks ?? 0}
              tooltip="가장 최근 주의 GSC 클릭 수입니다."
            />
            <SimpleStatCard
              label="최근 주간 노출 수"
              value={performance.trend[performance.trend.length - 1]?.impressions ?? 0}
              tooltip="가장 최근 주의 GSC 노출 수입니다."
            />
            <SimpleStatCard label="속성" value={performance.property} tooltip="연동된 Search Console 속성(Property)입니다." />
          </div>

          <Card className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-bold text-neutral-900">클릭·노출 추이</p>
              <p className="mt-0.5 text-xs text-neutral-500">GSC 자체 지연(2~3일)을 고려해 일 1회 배치로 갱신됩니다.</p>
            </div>
            <MultiLineChart
              data={performance.trend.map((w) => ({ week: w.week, 클릭: w.clicks, 노출: w.impressions }))}
              series={["클릭", "노출"]}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <p className="text-sm font-bold text-neutral-900">상위 검색어</p>
            <DataTable
              columns={[
                { key: "query", label: "검색어", render: (r) => r.query },
                { key: "clicks", label: "클릭", align: "right", render: (r) => r.clicks.toLocaleString("ko-KR") },
                { key: "impressions", label: "노출", align: "right", render: (r) => r.impressions.toLocaleString("ko-KR") },
                { key: "ctr", label: "CTR", align: "right", render: (r) => `${(r.ctr * 100).toFixed(1)}%` },
                { key: "position", label: "평균 순위", align: "right", render: (r) => r.position.toFixed(1) },
              ]}
              rows={performance.topQueries}
              getRowId={(r) => r.id}
            />
          </Card>

          {((performance.devices?.length ?? 0) > 0 || (performance.countries?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {performance.devices && performance.devices.length > 0 && (
                <Card className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">기기별 검색 성과</p>
                    <p className="mt-0.5 text-xs text-neutral-500">콘텐츠를 요약형/긴 글 중 어디에 우선 투자할지 참고하세요.</p>
                  </div>
                  <DataTable
                    columns={[
                      { key: "device", label: "기기", render: (r) => r.device },
                      { key: "clicks", label: "클릭", align: "right", render: (r) => r.clicks.toLocaleString("ko-KR") },
                      { key: "impressions", label: "노출", align: "right", render: (r) => r.impressions.toLocaleString("ko-KR") },
                      { key: "ctr", label: "CTR", align: "right", render: (r) => `${(r.ctr * 100).toFixed(1)}%` },
                    ]}
                    rows={performance.devices}
                    getRowId={(r) => r.device}
                  />
                </Card>
              )}
              {performance.countries && performance.countries.length > 0 && (
                <Card className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">국가별 검색 성과</p>
                    <p className="mt-0.5 text-xs text-neutral-500">실제 노출 국가를 근거로 마켓 확장 우선순위를 정할 수 있습니다.</p>
                  </div>
                  <DataTable
                    columns={[
                      { key: "country", label: "국가", render: (r) => r.country },
                      { key: "clicks", label: "클릭", align: "right", render: (r) => r.clicks.toLocaleString("ko-KR") },
                      { key: "impressions", label: "노출", align: "right", render: (r) => r.impressions.toLocaleString("ko-KR") },
                    ]}
                    rows={performance.countries}
                    getRowId={(r) => r.country}
                  />
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
