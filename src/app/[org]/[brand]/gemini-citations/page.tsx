import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { geminiPeriod, loadGeminiOverview, loadGeminiCitations, loadGeminiCitationDetail, safeCitationUrl } from "@/lib/backend/geminiCitations";
import { buildGeminiOverview } from "@/lib/geminiCitationMetrics";
import { GeminiOverviewPanel } from "@/components/gemini-citations/GeminiOverviewPanel";

export const dynamic = "force-dynamic";

const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default async function GeminiCitationsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; page?: string; run?: string; range?: string; citation?: string; promptPage?: string; videoPage?: string }>;
}) {
  const tenant = await getCurrentTenant();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 500) : "";
  const runId = typeof params.run === "string" ? params.run : null;
  const path = `${tenant.base}/gemini-citations`;
  const period = geminiPeriod(params.range);
  const citation = ["own", "youtube", "unknown", "none"].includes(params.citation ?? "") ? params.citation! : "all";
  const href = (page: number, run?: string) => `${path}?${new URLSearchParams({ range: period.range, q, citation, promptPage: params.promptPage ?? "1", videoPage: params.videoPage ?? "1", page: String(page), ...(run ? { run } : {}) })}${run ? "#gemini-answer" : ""}`;
  const active = !tenant.demo && !!tenant.brandId;
  const [data, overview, detail] = await Promise.all([
    active ? loadGeminiCitations(tenant.orgId, tenant.brandId, "", Number(params.page ?? 1)) : Promise.resolve({ rows: [], total: 0, page: 1, pageCount: 1 }),
    active ? loadGeminiOverview(tenant.orgId, tenant.brandId, period) : Promise.resolve({ ...buildGeminiOverview([], [], [], period.dates), channelCount: 0 }),
    runId && active ? loadGeminiCitationDetail(tenant.orgId, tenant.brandId, runId) : Promise.resolve(null),
  ]);
  if (runId && !detail) notFound();

  return <div className="space-y-6 p-8">
    <div><h1 className="text-2xl font-bold">Gemini 인용</h1>
      <p className="mt-2 text-sm text-slate-500">{tenant.brand?.name ?? "선택 브랜드"}의 Gemini 답변에 인용된 YouTube 영상과 우리 채널 성과를 확인합니다.</p></div>
    <form action={path} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">조회 기간<select name="range" defaultValue={period.range} className="mt-1 block rounded border px-3 py-2"><option value="1w">최근 1주</option><option value="2w">최근 2주</option><option value="4w">최근 4주</option><option value="12w">최근 12주</option></select></label>
      <button className="rounded bg-slate-800 px-4 py-2 text-sm text-white">조회</button>
      <span className="py-2 text-sm text-slate-500">{period.dates[0]} – {period.dates.at(-1)} (KST)</span>
      <a href={`${tenant.base}/prompt-library`} className="py-2 text-sm underline">프롬프트 라이브러리</a>
    </form>
    <GeminiOverviewPanel overview={overview} path={path} range={period.range} query={q} citation={citation} promptPage={params.promptPage} videoPage={params.videoPage} />
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">전체 수집 이력 {data.total.toLocaleString()}건</summary>
    <p className="my-3 text-xs text-slate-500">전체 기간의 브랜드 수집 요청에 연결된 결과입니다. 브랜드 연결 정보가 없는 과거 결과는 수집 로그에서 확인할 수 있습니다.</p>
    <section className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm"><caption className="p-4 text-left font-medium">수집 결과 {data.total.toLocaleString()}건</caption>
        <thead className="bg-slate-50"><tr>{["프롬프트", "수집 시각 (KST)", "상태", "웹 검색", "출처 수"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id} className="border-t">
          <td className="max-w-md break-words p-3"><a href={href(data.page, row.id)} className="text-blue-700 underline">{row.query}</a></td>
          <td className="whitespace-nowrap p-3">{date(row.runAt)}</td><td className="p-3">{row.status === "success" ? "완료" : row.status === "failed" ? "실패" : "대기"}</td>
          <td className="p-3">{row.webSearch === true ? "사용" : row.webSearch === false ? "미사용" : "기록 없음"}</td><td className="p-3">{row.citationCount}</td>
        </tr>)}</tbody>
      </table>
      {!data.rows.length && <p className="p-6 text-sm text-slate-500">표시할 Gemini 수집 결과가 없습니다.</p>}
    </section>
    <nav aria-label="수집 결과 페이지" className="flex gap-4 text-sm">
      {data.page > 1 && <a href={href(data.page - 1)} className="underline">이전</a>}
      <span>{data.page} / {data.pageCount}</span>
      {data.page < data.pageCount && <a href={href(data.page + 1)} className="underline">다음</a>}
    </nav>
    </details>
    {detail && <section id="gemini-answer" className="scroll-mt-6 space-y-4 rounded-lg border p-6" aria-label="Gemini 답변 상세">
      <div className="flex justify-between gap-4"><h2 className="text-lg font-semibold">{detail.rawMetadata.query}</h2><a href={href(data.page)} className="shrink-0 text-sm underline">상세 닫기</a></div>
      <p className="text-sm text-slate-500">{date(detail.runAt)} · {detail.rawMetadata.model ?? "Gemini"}</p>
      {detail.status === "failed" && <p role="status" className="text-sm text-red-700">수집에 실패했습니다. 수집 로그에서 오류를 확인하세요.</p>}
      {detail.rawMetadata.webSearch === false && <p className="text-sm text-amber-700">웹 검색 없이 수집한 답변입니다. 출처 유무로 인용 성과를 판단할 수 없습니다.</p>}
      <h3 className="font-medium">답변 원문</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{detail.rawResponse || "저장된 답변이 없습니다."}</p>
      <h3 className="font-medium">출처</h3>
      <ul className="space-y-2 text-sm">{(detail.rawMetadata.citations ?? []).map((citation, index) => {
        const url = safeCitationUrl(citation.url);
        return <li key={index} className="break-all">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{citation.title || url}</a> : <span>{citation.title || "유효하지 않은 출처 주소"}</span>}</li>;
      })}</ul>
      {!detail.rawMetadata.citations?.length && <p className="text-sm text-slate-500">저장된 출처가 없습니다.</p>}
    </section>}
  </div>;
}
