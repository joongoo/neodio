import { Card } from "@/components/ui/Card";
import { CITATION_SOURCE_LABELS, type CitationOverview, type CitationSourceType } from "@/lib/citationMetrics";
import { citationPageSize, citationStatus } from "@/lib/citationPresentation";
import { cn } from "@/lib/cn";
import { CitationTrendChart } from "./CitationTrendChart";
import { CitationStatCard } from "./CitationStatCard";
import { CitationPager, CitationTableFilters } from "./CitationControls";
import type { PromptSurface } from "@/lib/promptSurfaces";

const percent = (value: number | null) => value === null ? "–" : `${(value * 100).toFixed(1)}%`;
const colors: Record<CitationSourceType, string> = { own: "bg-blue-500", other: "bg-orange-400", unknown: "bg-neutral-400", own_web: "bg-slate-500", competitor: "bg-slate-400", web: "bg-slate-300" };
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
function pageNumber(value: string | undefined, pages: number) { const n = Number(value ?? 1); return Math.min(pages, Math.max(1, Number.isSafeInteger(n) ? n : 1)); }

function CitationVideos({ row }: { row: CitationOverview["rows"][number] }) {
  const videos = row.citations.filter(c => c.videoId);
  if (!videos.length) return <span className="text-xs text-neutral-400">영상 인용 없음</span>;
  const item = (video: typeof videos[number]) => <li key={video.videoId}>
    <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer"
      className={cn("block rounded-md border px-2.5 py-2 transition-colors hover:bg-neutral-100", video.type === "own" ? "border-blue-200 bg-blue-50/60" : "border-neutral-200 bg-white")}>
      <p className="line-clamp-2 text-xs font-medium text-neutral-900">{video.title || video.videoId}</p>
      <p className="mt-1 text-[11px] text-neutral-500"><span className={video.type === "own" ? "font-medium text-blue-700" : ""}>{CITATION_SOURCE_LABELS[video.type]}</span> · {video.channelTitle || "채널명 기록 없음"}</p>
    </a>
  </li>;
  return <div className="min-w-56 max-w-md"><ul className="space-y-2">{videos.slice(0, 3).map(item)}</ul>{videos.length > 3 && <details className="mt-2"><summary className="cursor-pointer text-xs text-neutral-500">외 {videos.length - 3}개 영상</summary><ul className="mt-2 space-y-2">{videos.slice(3).map(item)}</ul></details>}</div>;
}

export function CitationOverviewPanel({ overview: o, path, engine, range, query, citation, promptPage, videoPage, size, videoSize }: {
  overview: CitationOverview & { channelCount: number }; path: string; engine: PromptSurface; range: string; query: string; citation: string; promptPage?: string; videoPage?: string; size?: string; videoSize?: string;
}) {
  const filtered = o.rows.filter(row => row.query.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (
    citation === "own" ? row.measurable && row.hasOwn : citation === "youtube" ? row.measurable && row.hasYoutube :
      citation === "unknown" ? row.measurable && row.hasUnknown : citation === "none" ? row.measurable && !row.hasYoutube : true));
  const pageSize = citationPageSize(size);
  const vSize = citationPageSize(videoSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = pageNumber(promptPage, pages);
  const videoPages = Math.max(1, Math.ceil(o.videos.length / vSize));
  const vPage = pageNumber(videoPage, videoPages);
  const link = (run: string) => `${path}?${new URLSearchParams({ engine, range, q: query, citation, promptPage: String(page), videoPage: String(vPage), size: String(pageSize), videoSize: String(vSize), run })}#citation-answer`;
  const sources = Object.entries(o.sourceCounts) as [CitationSourceType, number][];
  const totalSources = sources.reduce((sum, [, count]) => sum + count, 0);
  const cards = [
    { label: "추적 프롬프트", value: String(o.rows.length), sub: `답변 측정 ${o.measured}개 · 미측정/미응답 ${o.excluded}개`, tooltip: "선택 엔진의 추적 프롬프트와 기간 내 수집 기록이 있는 프롬프트입니다. 미수집과 답변 없음은 인용률 분모에 포함하지 않습니다." },
    ...(engine === "google-aio" ? [{ label: "AIO 노출률", value: percent(o.exposureRate), sub: `${o.exposurePresent} / ${o.exposureMeasured}개 측정 프롬프트`, tooltip: "AI Overview가 노출된 프롬프트 ÷ 노출 여부를 측정한 프롬프트. 실패와 미수집은 제외합니다." }] : []),
    { label: "YouTube 인용률", value: percent(o.youtubeRate), sub: `${o.youtube} / ${o.measured}개 답변`, tooltip: "YouTube 영상이 인용된 답변 ÷ 측정 가능한 AI 답변. Gemini는 웹 검색을 사용한 답변만 포함합니다." },
    { label: "우리 채널 인용률", value: o.channelCount ? percent(o.ownRate) : "–", sub: o.channelCount ? `${o.own} / ${o.classifiable}개 판별 가능 답변` : "브랜드 설정에서 채널을 연결하세요", tooltip: "우리 채널 영상이 인용된 답변 ÷ 채널 판별이 가능한 답변. 소유 여부가 불확실한 답변은 분모에서 제외합니다.", highlight: true },
    { label: "인용된 우리 영상", value: o.channelCount && o.measured ? `${o.ownVideos}개` : "–", sub: `채널 미확인 영상 ${o.unknownVideos}개`, tooltip: "프롬프트별 최신 성공 답변에 인용된 우리 채널 영상 수입니다. 동일 영상은 한 번만 집계합니다." },
  ];
  return <div className="flex flex-col gap-5">
    <div className={`grid grid-cols-2 gap-4 ${engine === "google-aio" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>{cards.map(card => <CitationStatCard key={card.label} {...card} />)}</div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
        <h2 className="text-base font-bold text-neutral-900">일별 추이</h2>
        <CitationTrendChart trend={o.trend} showExposure={engine === "google-aio"} />
        <details className="text-xs text-neutral-500"><summary className="cursor-pointer">일별 데이터 보기</summary><div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left"><thead><tr><th scope="col">날짜 (KST)</th><th scope="col">측정 답변</th>{engine === "google-aio" && <th scope="col">AIO 노출률</th>}<th scope="col">YouTube</th><th scope="col">우리 채널</th></tr></thead><tbody>{o.trend.map(point => <tr key={point.day}><td className="py-1">{point.day}</td><td>{point.measured}</td>{engine === "google-aio" && <td>{percent(point.exposureRate)}</td>}<td>{percent(point.youtubeRate)}</td><td>{o.channelCount ? percent(point.ownRate) : "–"}</td></tr>)}</tbody></table></div></details>
      </Card>
      <Card className="flex flex-col gap-4 p-5">
        <div><h2 className="text-base font-bold text-neutral-900">인용 소스 점유율</h2><p className="mt-0.5 text-xs text-neutral-500">전체 인용 링크 기준 · 우리 영상 점유율(SoV) {percent(totalSources ? o.sourceCounts.own / totalSources : null)}</p></div>
        <ul className="flex flex-col gap-3.5">{sources.filter(([type, count]) => type !== "unknown" || count > 0).map(([type, count]) => <li key={type} className="flex flex-col gap-1.5"><div className="flex items-center justify-between text-sm"><span className="text-neutral-700">{CITATION_SOURCE_LABELS[type]}</span><span className="text-xs tabular-nums text-neutral-500">{count}개 · {percent(totalSources ? count / totalSources : null)}</span></div><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${colors[type]}`} style={{ width: `${totalSources ? count / totalSources * 100 : 0}%` }} /></div></li>)}</ul>
      </Card>
    </div>
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-neutral-900">프롬프트별 인용 현황</h2><p className="text-xs text-neutral-500">선택 기간 내 최신 성공 수집 기준 · 프롬프트를 누르면 답변 원문으로 이동합니다.</p></div>
      <CitationTableFilters key={`${engine}:${range}`} query={query} citation={citation} />
      <p className="text-xs text-neutral-500">전체 {o.rows.length.toLocaleString("ko-KR")}개 중 {filtered.length.toLocaleString("ko-KR")}개</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-sm"><thead><tr className="bg-neutral-50 text-left text-xs text-neutral-500">{["프롬프트", engine === "google-aio" ? "AIO" : "답변", "인용된 YouTube 영상", "수집일"].map((label, index) => <th scope="col" key={label} className={cn("px-3 py-2.5 font-medium", index === 0 && "rounded-l-md", index === 3 && "rounded-r-md")}>{label}</th>)}</tr></thead>
        <tbody>{filtered.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={row.promptId} className={cn("border-b border-neutral-100 align-top hover:bg-neutral-50", row.hasOwn && row.measurable && "bg-blue-50/30")}>
          <td className="max-w-md px-3 py-3 font-medium text-neutral-900">{row.id ? <a className="hover:underline" href={link(row.id)}>{row.query}</a> : row.query}</td>
          <td className="px-3 py-3"><span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", row.measurable ? "bg-slate-100 text-slate-700" : "bg-neutral-100 text-neutral-500")}>{citationStatus(row, engine)}</span></td>
          <td className="px-3 py-3">{row.measurable ? <CitationVideos row={row} /> : <span className="text-neutral-400">–</span>}</td>
          <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-500">{row.runAt ? date(row.runAt) : "–"}</td>
        </tr>)}{!filtered.length && <tr><td colSpan={4} className="px-3 py-10 text-center text-sm text-neutral-500">조건에 맞는 프롬프트가 없습니다. 검색어나 필터를 변경해 주세요.</td></tr>}</tbody>
      </table></div>
      <CitationPager kind="prompt" page={page} pageCount={pages} total={filtered.length} pageSize={pageSize} />
    </Card>
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-neutral-900">인용된 YouTube 영상</h2><p className="text-xs text-neutral-500">최신 측정 답변 기준 · 인용 프롬프트 수 순</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="bg-neutral-50 text-xs text-neutral-500">{["영상", "채널", "구분", "인용 프롬프트", "최근 답변"].map(label => <th scope="col" className="px-3 py-2.5 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{o.videos.slice((vPage - 1) * vSize, vPage * vSize).map(video => <tr key={video.videoId} className={cn("border-b border-neutral-100 align-top hover:bg-neutral-50", video.type === "own" && "bg-blue-50/30")}><td className="max-w-md px-3 py-3 font-medium text-neutral-900"><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{video.title || video.videoId}</a></td><td className="px-3 py-3 text-neutral-500">{video.channelTitle || "채널명 기록 없음"}</td><td className="px-3 py-3"><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs", video.type === "own" ? "bg-blue-50 text-blue-700" : "bg-neutral-100 text-neutral-600")}>{CITATION_SOURCE_LABELS[video.type]}</span></td><td className="px-3 py-3 tabular-nums">{video.prompts}개</td><td className="px-3 py-3"><a href={link(video.runId)} className="text-slate-700 hover:underline">답변 보기</a></td></tr>)}{!o.videos.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-neutral-500">기간 내 영상 인용 기록이 없습니다.</td></tr>}</tbody></table></div>
      <CitationPager kind="video" page={vPage} pageCount={videoPages} total={o.videos.length} pageSize={vSize} />
    </Card>
    <details className="text-xs leading-6 text-neutral-500"><summary className="cursor-pointer">지표 산정 기준</summary><p className="mt-2">지표는 선택 엔진·기간의 프롬프트별 최신 성공 수집 기준입니다. 기기 구분 없이 마지막 성공 수집을 사용합니다. 인용률은 AI 답변이 있는 프롬프트 기준이며, Gemini는 웹 검색을 사용한 답변만 포함합니다. 우리 채널 인용률은 채널 판별이 가능한 답변 기준입니다.</p></details>
  </div>;
}