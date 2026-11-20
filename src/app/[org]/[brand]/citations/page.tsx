import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { citationPeriod, loadCitationOverview } from "@/lib/backend/citationOverview";
import { citationDetailHref } from "@/lib/citationNavigation";
import { buildDeviceCitationOverview, citationDevice } from "@/lib/citationDevices";
import { citationEngine, CITATION_ENGINES } from "@/lib/citationEngines";
import { CitationOverviewPanel } from "@/components/citations/CitationOverviewPanel";
import { CitationToolbar, CitationExportButton } from "@/components/citations/CitationControls";
import { citationStatus } from "@/lib/citationPresentation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CitationsPage({ searchParams }: {
  searchParams: Promise<{ engine?: string; device?: string; q?: string; run?: string; range?: string; citation?: string; promptPage?: string; videoPage?: string; size?: string; videoSize?: string }>;
}) {
  const tenant = await getCurrentTenant();
  const params = await searchParams;
  const engine = citationEngine(params.engine);
  const device = citationDevice(params.device, engine);
  const engineName = CITATION_ENGINES[engine];
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 500) : "";
  const runId = typeof params.run === "string" ? params.run : null;
  const path = `${tenant.base}/citations`;
  if (runId) redirect(citationDetailHref(path, runId, engine, params));
  const period = citationPeriod(params.range);
  const citation = ["own", "youtube", "unknown", "none"].includes(params.citation ?? "") ? params.citation! : "all";
  const active = !tenant.demo && !!tenant.brand;
  const overview = active ? await loadCitationOverview(tenant.orgId, tenant.brand!, engine, period, undefined, device) : { ...buildDeviceCitationOverview([], [], [], period.dates, [], engine, device), channelCount: 0 };
  const searchless = engine === "gemini" ? overview.rows.filter(row => row.status === "success" && row.webSearch === false).length : 0;
  const latestAt = overview.rows.find(row => row.runAt)?.runAt;
  const exportRows = overview.rows.map(row => [row.query, citationStatus(row, engine), row.measurable ? row.citations.filter(source => source.videoId).map(source => `${source.title} https://www.youtube.com/watch?v=${source.videoId}`).join("\n") : "", row.measurable ? row.hasOwn ? "인용" : row.hasUnknown ? "미확인" : "미인용" : "미측정", row.runAt]);

  return <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-medium tracking-wide text-neutral-500">YOUTUBE 인용 트래커</p><h1 className="mt-1 text-2xl font-semibold text-neutral-900">인용</h1>
        <p className="mt-1 text-sm text-neutral-500">{tenant.selectedBrandName} · {engineName} 답변에 인용된 YouTube 영상과 우리 채널 성과를 확인합니다.{latestAt && ` · 최근 결과 ${new Date(latestAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <CitationExportButton rows={exportRows} filename={`${tenant.selectedBrandName}-${engine}-citations-${period.dates.at(-1)}.csv`} />
        <Button href={`${tenant.base}/prompt-library`} variant="primary" icon={<Plus size={16} />}>{tenant.canEdit ? "프롬프트 추가·수집" : "프롬프트 라이브러리"}</Button>
      </div>
    </div>
    <CitationToolbar engine={engine} device={device} range={period.range} from={period.dates[0]} to={period.dates.at(-1)!} />
    {searchless > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Gemini가 인터넷 자료를 찾아보지 않고 작성한 답변이 {searchless}개 있습니다. 이 답변은 인용 여부를 확인할 수 없어 인용률 계산에서 제외됩니다. 아래 프롬프트를 누르면 답변 내용을 볼 수 있습니다.</p>}
    {overview.rows.length === 0 ? <Card className="flex flex-col items-center gap-3 py-16 text-center"><p className="text-base font-bold text-neutral-900">추적할 프롬프트를 추가하세요</p><p className="max-w-md text-sm text-neutral-500">프롬프트 라이브러리에서 {engineName} 엔진을 선택해 수집하면 영상 인용 현황과 추이가 표시됩니다.</p><Button href={`${tenant.base}/prompt-library`} variant="primary" icon={<Plus size={16} />}>프롬프트 라이브러리</Button></Card> :
      <CitationOverviewPanel overview={overview} path={path} engine={engine} device={device} range={period.range} query={q} citation={citation} promptPage={params.promptPage} videoPage={params.videoPage} size={params.size} videoSize={params.videoSize} />}
    <p className="text-xs text-neutral-500">브랜드 연결을 확인할 수 없는 과거 수집 결과는 <a href={`${tenant.base}/collection-runs`} className="underline">수집 로그</a>에서 확인하세요.</p>

  </div>;
}
