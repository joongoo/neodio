import { Card } from "@/components/ui/Card";
import { GEMINI_SOURCE_LABELS, type GeminiOverview, type GeminiSourceType } from "@/lib/geminiCitationMetrics";
import { GeminiTrendChart } from "./GeminiTrendChart";

const percent = (value: number | null) => value === null ? "–" : `${(value * 100).toFixed(1)}%`;
const colors: Record<GeminiSourceType, string> = { own: "bg-blue-500", other: "bg-orange-400", unknown: "bg-neutral-400", web: "bg-slate-600" };
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
function pageNumber(value: string | undefined, pages: number) { const n = Number(value ?? 1); return Math.min(pages, Math.max(1, Number.isSafeInteger(n) ? n : 1)); }

export function GeminiOverviewPanel({ overview: o, path, range, query, citation, promptPage, videoPage }: {
  overview: GeminiOverview & { channelCount: number }; path: string; range: string; query: string; citation: string; promptPage?: string; videoPage?: string;
}) {
  const measured = o.rows.filter(row => row.measurable);
  const filtered = o.rows.filter(row => row.query.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (
    citation === "own" ? row.measurable && row.hasOwn : citation === "youtube" ? row.measurable && row.hasYoutube :
      citation === "unknown" ? row.measurable && row.hasUnknown : citation === "none" ? row.measurable && !row.hasYoutube : true));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const page = pageNumber(promptPage, pages);
  const videoPages = Math.max(1, Math.ceil(o.videos.length / 10));
  const vPage = pageNumber(videoPage, videoPages);
  const link = (params: Record<string, string>) => `${path}?${new URLSearchParams({ range, q: query, citation, promptPage: String(page), videoPage: String(vPage), ...params })}${params.run ? "#gemini-answer" : ""}`;
  const sources = Object.entries(o.sourceCounts) as [GeminiSourceType, number][];
  const totalSources = sources.reduce((sum, [, count]) => sum + count, 0);
  const cards = [
    { label: "수집된 프롬프트", value: String(o.rows.length), sub: `측정 가능 ${o.measured}개 · 제외 ${o.excluded}개` },
    { label: "YouTube 인용률", value: percent(o.youtubeRate), sub: `${o.youtube} / ${o.measured}개 답변` },
    { label: "우리 채널 인용률", value: o.channelCount ? percent(o.ownRate) : "–", sub: o.channelCount ? `${o.own} / ${o.classifiable}개 판별 가능 답변` : "브랜드 설정에서 채널을 연결하세요" },
    { label: "인용된 우리 영상", value: o.channelCount && o.measured ? `${o.ownVideos}개` : "–", sub: `채널 미확인 영상 ${o.unknownVideos}개` },
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{cards.map(card => <Card key={card.label} className="p-5"><h2 className="text-sm text-neutral-500">{card.label}</h2><p className="my-2 text-3xl font-semibold">{card.value}</p><p className="text-xs text-neutral-500">{card.sub}</p></Card>)}</div>
    <p className="text-xs leading-6 text-neutral-500">지표는 선택 기간의 프롬프트별 최신 수집 1건 기준입니다. 실패·웹 검색 미사용·검색 여부 기록 없음은 측정에서 제외합니다. 우리 채널 인용률은 채널 판별이 가능한 답변만 분모에 포함합니다. 인용 순위·AIO 노출률은 Gemini API 데이터에서 측정하지 않습니다.</p>
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2"><h2 className="mb-4 font-semibold">일별 인용 추이</h2><GeminiTrendChart trend={o.trend} />
        <details className="mt-3 text-xs text-neutral-500"><summary className="cursor-pointer">일별 데이터 보기</summary><div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left"><thead><tr><th scope="col">날짜 (KST)</th><th scope="col">측정 답변</th><th scope="col">YouTube</th><th scope="col">우리 채널</th></tr></thead><tbody>{o.trend.map(point => <tr key={point.day}><td className="py-1">{point.day}</td><td>{point.measured}</td><td>{percent(point.youtubeRate)}</td><td>{o.channelCount ? percent(point.ownRate) : "–"}</td></tr>)}</tbody></table></div></details>
      </Card>
      <Card><h2 className="font-semibold">인용 소스 점유율</h2><p className="mt-1 text-xs text-neutral-500">최신 측정 답변의 출처 {totalSources}개 · 같은 답변의 동일 영상은 1개</p>
        <ul className="mt-5 space-y-5">{sources.map(([type, count]) => <li key={type}><div className="mb-2 flex justify-between text-sm"><span>{GEMINI_SOURCE_LABELS[type]}</span><span>{count}개 · {percent(totalSources ? count / totalSources : null)}</span></div><div className="h-2 overflow-hidden rounded bg-neutral-100"><div className={`h-full ${colors[type]}`} style={{ width: `${totalSources ? count / totalSources * 100 : 0}%` }} /></div></li>)}</ul>
      </Card>
    </div>
    <Card><div className="mb-4"><h2 className="font-semibold">프롬프트별 인용 현황</h2><p className="mt-1 text-xs text-neutral-500">기간 내 최신 수집 기준 · 검색·필터는 이 목록에만 적용됩니다.</p></div>
      <form action={path} className="mb-4 flex flex-wrap items-end gap-3"><input type="hidden" name="range" value={range} />
        <label className="text-sm">프롬프트<input name="q" defaultValue={query} maxLength={500} className="mt-1 block rounded border px-3 py-2" /></label>
        <label className="text-sm">인용 유형<select name="citation" defaultValue={citation} className="mt-1 block rounded border px-3 py-2"><option value="all">전체</option><option value="own">우리 채널 인용</option><option value="youtube">YouTube 인용</option><option value="unknown">채널 미확인 포함</option><option value="none">영상 인용 없음</option></select></label>
        <button className="rounded bg-slate-800 px-4 py-2 text-sm text-white">적용</button><a href={`${path}?range=${range}`} className="py-2 text-sm underline">초기화</a>
      </form>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-50"><tr>{["프롬프트", "최종 수집 (KST)", "측정 상태", "영상 출처", "우리 채널"].map(label => <th scope="col" key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{filtered.slice((page - 1) * 10, page * 10).map(row => <tr key={row.id} className="border-t"><td className="max-w-md p-3"><a className="text-blue-700 underline" href={link({ run: row.id })}>{row.query}</a></td><td className="whitespace-nowrap p-3">{date(row.runAt)}</td><td className="p-3">{row.measurable ? "측정 완료" : row.status === "failed" ? "수집 실패" : row.webSearch === false ? "웹 검색 미사용" : "미측정"}</td><td className="p-3">{row.measurable ? row.citations.filter(c => c.videoId).length : "–"}</td><td className="p-3">{!row.measurable || !o.channelCount ? "–" : row.hasOwn ? "인용" : row.hasUnknown ? "미확인" : "미인용"}</td></tr>)}</tbody></table></div>
      {!filtered.length && <p className="py-8 text-center text-sm text-neutral-500">표시할 프롬프트가 없습니다.</p>}
      <nav aria-label="프롬프트 페이지" className="mt-4 flex gap-4 text-sm">{page > 1 && <a className="underline" href={link({ promptPage: String(page - 1) })}>이전</a>}<span>{filtered.length}개 · {page} / {pages}</span>{page < pages && <a className="underline" href={link({ promptPage: String(page + 1) })}>다음</a>}</nav>
    </Card>
    <Card><h2 className="font-semibold">인용된 YouTube 영상</h2><p className="mt-1 text-xs text-neutral-500">최신 측정 답변 기준 · 인용 프롬프트 수 순 · {measured.length}개 답변</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-neutral-50"><tr>{["영상", "채널", "구분", "인용 프롬프트", "최근 답변"].map(label => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{o.videos.slice((vPage - 1) * 10, vPage * 10).map(video => <tr key={video.videoId} className="border-t"><td className="max-w-md p-3"><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{video.title || video.videoId}</a></td><td className="p-3">{video.channelTitle || "채널명 기록 없음"}</td><td className="p-3">{GEMINI_SOURCE_LABELS[video.type]}</td><td className="p-3">{video.prompts}개</td><td className="p-3"><a href={link({ run: video.runId })} className="underline">답변 보기</a></td></tr>)}</tbody></table></div>
      {!o.videos.length && <p className="py-8 text-center text-sm text-neutral-500">기간 내 영상 인용 기록이 없습니다.</p>}
      <nav aria-label="인용 영상 페이지" className="mt-4 flex gap-4 text-sm">{vPage > 1 && <a className="underline" href={link({ videoPage: String(vPage - 1) })}>이전</a>}<span>{o.videos.length}개 · {vPage} / {videoPages}</span>{vPage < videoPages && <a className="underline" href={link({ videoPage: String(vPage + 1) })}>다음</a>}</nav>
    </Card>
  </div>;
}
