import Link from "next/link";
import { ArrowLeft, ExternalLink, Video } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AioMarkdown } from "@/components/youtube-aio/AioMarkdown";
import { cn } from "@/lib/cn";
import { citationStatus } from "@/lib/citationPresentation";
import { CITATION_ENGINES, supportsAioExposure } from "@/lib/citationEngines";
import { CITATION_SOURCE_LABELS } from "@/lib/citationMetrics";
import { citationDetailHref } from "@/lib/citationNavigation";
import { safeCitationUrl } from "@/lib/safeCitationUrl";
import type { CitationHistoryState } from "@/lib/citationDetail";
import type { CitationDetailPageData } from "@/lib/backend/citationDetail";
import type { PromptSurface } from "@/lib/promptSurfaces";
import { CITATION_DEVICE_LABELS, supportsCitationDevices } from "@/lib/citationDevices";

const historyStyle: Record<CitationHistoryState, { color: string; label: string }> = {
  own: { color: "bg-blue-600", label: "우리 영상 인용" }, youtube: { color: "bg-orange-200", label: "YouTube 인용" },
  none: { color: "bg-neutral-200", label: "YouTube 미인용" }, absent: { color: "border border-dashed border-neutral-300 bg-white", label: "AI 답변 없음" },
  unknown: { color: "bg-amber-100", label: "채널 미확인" }, searchless: { color: "bg-amber-50 border border-amber-200", label: "인터넷 출처 미수집" },
  failed: { color: "bg-red-50 border border-red-200", label: "수집 실패" }, unmeasured: { color: "border border-neutral-200 bg-neutral-50", label: "미측정" },
};
const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

function VideoThumb({ id }: { id: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- validated YouTube video ID, public thumbnail
  return <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded bg-neutral-100 object-cover" />;
}

export function CitationDetailView({ data, engine, base, backHref, params }: { data: CitationDetailPageData; engine: PromptSurface; base: string; backHref: string; params: Record<string, string | string[] | undefined> }) {
  const { snapshot, current, history, ownVideos, workLogs, retention } = data;
  const engineName = CITATION_ENGINES[engine];
  const deviceLabel = supportsCitationDevices(engine) ? snapshot.device ? CITATION_DEVICE_LABELS[snapshot.device] : "기기 정보 없음" : null;
  const path = `${base}/citations`;
  const detailHref = (id: string) => citationDetailHref(path, id, engine, params);
  const tags = [
    { text: citationStatus(current, engine), color: "border border-neutral-300 bg-white text-neutral-800" },
    ...(current.measurable ? [{ text: current.hasYoutube ? "YouTube 인용" : "YouTube 미인용", color: current.hasYoutube ? "bg-orange-50 text-orange-700" : "bg-neutral-100 text-neutral-500" },
      { text: data.channelCount === 0 ? "채널 미연결" : current.hasOwn ? "우리 영상 인용" : current.hasUnknown ? "채널 미확인" : "우리 영상 미인용", color: current.hasOwn ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-500" }] : []),
  ];
  return <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
    <Link href={backHref} className="flex w-fit items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900"><ArrowLeft size={16} />프롬프트 목록</Link>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-neutral-900">&quot;{current.query}&quot;</h1><p className="mt-1 text-sm text-neutral-500">{engineName}{deviceLabel && ` · ${deviceLabel}`} · 수집 {new Date(snapshot.runAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} (KST){snapshot.rawMetadata.model && ` · ${snapshot.rawMetadata.model}`}</p></div>
      <div className="flex flex-wrap items-center gap-2">{tags.map(tag => <span key={tag.text} className={cn("rounded-full px-4 py-2 text-sm font-semibold", tag.color)}>{tag.text}</span>)}<Button href={`${base}/prompt-library`} variant="secondary" size="sm">프롬프트 라이브러리</Button></div>
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="flex min-w-0 flex-col gap-5 p-6 lg:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-bold text-neutral-900">{engineName} 답변 스냅샷</h2><span className="text-xs text-neutral-500">수집 당시 답변과 출처</span></div>
        {engine === "gemini" && current.webSearch === false && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Gemini가 인터넷 자료를 찾아보지 않고 작성한 답변입니다. 인용 여부를 확인할 수 없어 인용률 계산에서 제외됩니다.</p>}
        <div className="rounded-lg border border-neutral-200 p-5"><p className="mb-3 text-xs font-semibold text-neutral-500">{supportsAioExposure(engine) ? "AI 개요" : "답변 원문"}</p>
          {snapshot.status === "failed" ? <p className="text-sm text-red-700">수집에 실패했습니다. 오류 내용은 수집 로그에서 확인할 수 있습니다.</p> : current.answerPresent === false ? <p className="text-sm text-neutral-500">이번 검색에서는 AI 답변이 노출되지 않았습니다.</p> : snapshot.rawResponse ? <AioMarkdown text={snapshot.rawResponse} /> : <p className="text-sm text-neutral-500">저장된 답변이 없습니다.</p>}
        </div>
        <div className="flex flex-col gap-2"><h3 className="text-sm font-bold text-neutral-900">수집된 출처 ({current.citations.length}개)</h3>
          {current.citations.map((source, index) => {
            const href = safeCitationUrl(source.url);
            const own = source.type === "own";
            const content = <><span className={cn("w-5 shrink-0 text-sm font-semibold", own ? "text-blue-600" : "text-neutral-500")}>{index + 1}</span>{source.videoId && <VideoThumb id={source.videoId} />}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-900">{source.title || source.url}</span><span className="block truncate text-xs text-neutral-500">{source.videoId ? source.channelTitle || "YouTube" : href ? new URL(href).hostname : "유효하지 않은 주소"}</span></span><span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", own ? "bg-blue-600 text-white" : source.videoId ? "text-orange-700" : "text-neutral-500")}>{CITATION_SOURCE_LABELS[source.type]}</span>{href && <ExternalLink size={14} className="shrink-0 text-neutral-300" />}</>;
            const style = cn("flex items-center gap-4 rounded-lg border px-4 py-3", own ? "border-blue-500 bg-blue-50/40" : "border-neutral-200");
            return href ? <a key={source.url} href={href} target="_blank" rel="noopener noreferrer" className={cn(style, "hover:bg-neutral-50")}>{content}</a> : <div key={source.url} className={style}>{content}</div>;
          })}
          {!current.citations.length && <p className="text-sm text-neutral-500">저장된 출처가 없습니다.</p>}
        </div>
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card className="flex flex-col gap-3 p-6">
          <h2 className="text-base font-bold text-neutral-900">최근 14일 인용 히스토리</h2>
          {deviceLabel && <p className="text-xs text-neutral-500">{deviceLabel} 기준</p>}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>{history.map(day => {
            const label = `${short(day.date)} · ${historyStyle[day.state].label}`;
            return day.runId ? <Link key={day.date} href={detailHref(day.runId)} title={label} aria-label={label} className={cn("aspect-square rounded-md outline-offset-2", historyStyle[day.state].color, day.runId === snapshot.id && "ring-2 ring-slate-800 ring-offset-2")} /> : <span key={day.date} title={label} aria-label={label} role="img" className={cn("aspect-square rounded-md", historyStyle[day.state].color)} />;
          })}</div>
          <div className="flex justify-between text-xs text-neutral-500"><span>{short(history[0].date)}</span><span>{short(history.at(-1)!.date)}</span></div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">{Object.entries(historyStyle).filter(([state]) => ["own", "youtube", "none", "unmeasured"].includes(state) || history.some(day => day.state === state)).map(([state, style]) => <span key={state} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", style.color)} />{style.label}</span>)}</div>
          <p className="rounded-md bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">{retention.rate === null ? "최근 7일은 우리 채널 인용 유지율을 계산할 수 없습니다." : <>최근 7일 중 <b>{retention.numerator}일 인용</b> · 인용 유지율 {(retention.rate * 100).toFixed(1)}% <span className="text-neutral-500">(판별 가능 {retention.denominator}일 기준)</span></>}</p>
        </Card>
        {ownVideos.length === 0 ? <Card className="flex flex-col gap-2 p-6"><h2 className="text-base font-bold text-neutral-900">이 영상의 최적화 작업 이력</h2><p className="text-sm text-neutral-500">이 답변에서 우리 채널 영상이 확인되지 않았습니다. 인용되면 영상별 작업 이력과 다른 인용 프롬프트가 여기에 표시됩니다.</p></Card> : ownVideos.map(video => <div key={video.videoId} className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-6"><h2 className="text-base font-bold text-neutral-900">이 영상의 최적화 작업 이력</h2><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-neutral-800 hover:underline"><Video size={14} />{video.title}</a>
            {video.firstInPeriod && <p className="text-xs text-blue-700">최근 4주 내 첫 인용 관측 · {video.firstInPeriod}</p>}
            {workLogs.filter(log => log.videoId === video.videoId).length ? <ul className="space-y-2.5">{workLogs.filter(log => log.videoId === video.videoId).map(log => <li key={log.id} className="flex gap-4 text-sm"><span className="shrink-0 tabular-nums text-neutral-500">{short(log.workDate)}</span><span className="text-neutral-800">{log.workType}{log.note && ` — ${log.note}`}</span></li>)}</ul> : <p className="text-sm text-neutral-500">기록된 최적화 작업이 없습니다.</p>}
          </Card>
          <Card className="flex flex-col gap-3 p-6"><h2 className="text-base font-bold text-neutral-900">이 영상이 인용되는 다른 프롬프트</h2>{video.otherPrompts.length ? <div className="flex flex-wrap gap-2">{video.otherPrompts.map(prompt => <Link key={prompt.id} href={detailHref(prompt.id)} className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-200">{prompt.query}</Link>)}</div> : <p className="text-sm text-neutral-500">최근 4주 동안 같은 엔진의 다른 프롬프트에서는 인용되지 않았습니다.</p>}</Card>
        </div>)}
      </div>
    </div>
  </div>;
}
