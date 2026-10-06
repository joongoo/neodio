"use client";

import { EditOnly } from "@/components/auth/PermissionsProvider";

import { FormEvent, ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, ImageIcon, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { AioHistoryState, AioSourceType } from "@/lib/db";
import type { AioKeywordDetailPageData, AioOwnVideoDetail } from "@/lib/backend/aio/pageData";
import { AioCollectButton } from "./AioCollectButton";
import { COUNTRY_LABEL, DEVICE_LABEL, GROUP_LABEL, LANGUAGE_LABEL, formatKstDateTime, formatPercent, formatTimestamp, shortDate } from "./labels";

const SOURCE_TAG: Record<AioSourceType, { label: string; className: string }> = {
  own_video: { label: "우리 채널", className: "bg-blue-600 text-white" },
  other_youtube: { label: "타 채널 영상", className: "text-orange-700" },
  own_web: { label: "자사 웹", className: "text-neutral-500" },
  competitor: { label: "경쟁사", className: "text-red-700" },
  other: { label: "기타", className: "text-neutral-500" },
};

const HISTORY_STYLE: Record<AioHistoryState, { className: string; label: string }> = {
  own: { className: "bg-blue-600", label: "우리 영상 인용" },
  youtube: { className: "bg-orange-200", label: "YouTube만 인용" },
  no_youtube: { className: "bg-neutral-200", label: "YouTube 미인용" },
  absent: { className: "border border-dashed border-neutral-300 bg-white", label: "AIO 없음" },
  unmeasured: { className: "border border-neutral-200 bg-neutral-50", label: "미측정" },
};

const WORK_TYPES = ["자막(SRT) 업로드", "챕터(타임스탬프) 추가", "설명란 보강", "제목·썸네일 변경", "고정 댓글 추가", "기타"];

// 시안(AIO 인용 트래커 대시보드 1.pdf 3p) — 키워드 하나의 AIO 스냅샷.
export function AioKeywordDetailClient({ data }: { data: AioKeywordDetailPageData }) {
  const { keyword, latest, citations, history, ownVideos, settings, device, demo, brandId, base } = data;
  const router = useRouter();
  const ownPositions = new Set(citations.filter((c) => c.sourceType === "own_video").map((c) => c.position));
  const bestOwn = ownPositions.size > 0 ? Math.min(...ownPositions) : null;
  const present = latest?.status === "aio_present";
  const hasYoutube = citations.some((c) => c.sourceType === "own_video" || c.sourceType === "other_youtube");
  const last7 = history.slice(-7);
  const ownDays = last7.filter((h) => h.state === "own").length;

  async function archive() {
    if (!window.confirm(`"${keyword.keyword}" 추적을 중지할까요? 지난 수집 결과는 남아 있습니다.`)) return;
    const res = await fetch(`/api/youtube-aio/keywords?brandId=${encodeURIComponent(brandId)}&id=${encodeURIComponent(keyword.id)}`, { method: "DELETE" }).catch(
      () => null
    );
    if (res?.ok) router.push(`${base}/youtube-aio?device=${device}`);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
      <Link href={`${base}/youtube-aio?device=${device}`} className="flex w-fit items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        프롬프트 목록
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">&quot;{keyword.keyword}&quot;</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {GROUP_LABEL[keyword.group]} 그룹 · {COUNTRY_LABEL[settings.country] ?? settings.country} / {LANGUAGE_LABEL[settings.language] ?? settings.language} ·{" "}
            {DEVICE_LABEL[device]} · {latest ? `수집 ${formatKstDateTime(latest.collectedAt)}` : "아직 수집되지 않음"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latest && (
            <>
              <StatusPill tone={present ? "outline" : "off"}>{present ? "AIO 노출" : "AIO 없음"}</StatusPill>
              {present && <StatusPill tone={hasYoutube ? "youtube" : "off"}>{hasYoutube ? "YouTube 인용" : "YouTube 미인용"}</StatusPill>}
              {present && <StatusPill tone={bestOwn ? "own" : "off"}>{bestOwn ? `우리 영상 ${bestOwn}순위 인용` : "우리 영상 미인용"}</StatusPill>}
            </>
          )}
          {!demo && (
            <EditOnly><AioCollectButton brandId={brandId} keywordId={keyword.id} keywordLabel={keyword.keyword} searches={settings.devices.length} size="sm" /></EditOnly>
          )}
          {!demo && (
            <EditOnly>
              <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={archive}>
                추적 중지
              </Button>
            </EditOnly>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="flex flex-col gap-5 p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-neutral-900">AI Overview 스냅샷</h2>
            {latest?.hasScreenshot && !demo ? (
              <a
                href={`/api/youtube-aio/snapshot?brandId=${encodeURIComponent(brandId)}&id=${encodeURIComponent(latest.id)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900"
              >
                <ImageIcon size={14} />
                수집 당시 화면 보기
              </a>
            ) : (
              <span className="text-xs text-neutral-500">수집 원문 보관 · 우리 영상 근거 문장 하이라이트</span>
            )}
          </div>

          <div className="rounded-lg border border-neutral-200 p-5">
            <p className="mb-3 text-xs font-semibold text-neutral-500">AI 개요</p>
            {!latest ? (
              <p className="text-sm text-neutral-500">아직 이 프롬프트를 수집하지 않았습니다. 상단 &quot;이 키워드 지금 수집&quot;을 누르거나 다음 정기 수집 후 표시됩니다.</p>
            ) : !present ? (
              <p className="text-sm text-neutral-500">{shortDate(latest.collectedDate)} 검색에서는 AI Overview가 뜨지 않았습니다 (일반 SERP만).</p>
            ) : latest.paragraphs.length === 0 ? (
              <p className="text-sm text-neutral-500">본문을 읽지 못했습니다. 인용 소스 목록만 기록됐습니다.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {latest.paragraphs.map((p, i) => {
                  const backedByOwn = p.sources.some((s) => ownPositions.has(s));
                  return (
                    <p key={i} className="text-sm leading-relaxed text-neutral-800">
                      <span className={cn(backedByOwn && "bg-blue-50 underline decoration-blue-500 decoration-2 underline-offset-4")}>{p.text}</span>
                      {p.sources.length > 0 && (
                        <sup className="ml-1 text-[10px] font-semibold text-neutral-500">
                          {p.sources.map((s) => (
                            <span key={s} className={cn(ownPositions.has(s) && "text-blue-600")}>
                              [{s}]
                            </span>
                          ))}
                        </sup>
                      )}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          {present && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-neutral-900">인용된 소스 (노출 순서)</h3>
              {citations.map((c) => {
                const ownVideo = c.sourceType === "own_video";
                return (
                  <a
                    key={c.position}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "flex items-center gap-4 rounded-lg border px-4 py-3 hover:bg-neutral-50",
                      ownVideo ? "border-blue-500 bg-blue-50/40" : "border-neutral-200"
                    )}
                  >
                    <span className={cn("w-5 shrink-0 text-sm font-semibold", ownVideo ? "text-blue-600" : "text-neutral-500")}>{c.position}</span>
                    {c.videoId && <VideoThumb url={c.thumbnailUrl} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-900">{c.title || c.domain}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {c.videoId ? `YouTube${ownVideo ? " · 우리 채널" : ""}` : c.domain}
                        {c.startSeconds !== null && ` · 인용 구간 ${formatTimestamp(c.startSeconds)}~`}
                      </span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", SOURCE_TAG[c.sourceType].className)}>
                      {SOURCE_TAG[c.sourceType].label}
                    </span>
                    <ExternalLink size={14} className="shrink-0 text-neutral-300" />
                  </a>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="flex flex-col gap-3 p-6">
            <h2 className="text-base font-bold text-neutral-900">최근 {history.length}일 인용 히스토리</h2>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${history.length}, minmax(0, 1fr))` }}>
              {history.map((h) => (
                <div
                  key={h.date}
                  title={`${shortDate(h.date)} · ${HISTORY_STYLE[h.state].label}`}
                  className={cn("aspect-square rounded-md", HISTORY_STYLE[h.state].className)}
                />
              ))}
            </div>
            <div className="flex justify-between text-xs text-neutral-500">
              <span>{shortDate(history[0].date)}</span>
              <span>{shortDate(history[history.length - 1].date)}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
              {(["own", "youtube", "no_youtube", "absent", "unmeasured"] as AioHistoryState[]).map((state) => (
                <span key={state} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", HISTORY_STYLE[state].className)} />
                  {HISTORY_STYLE[state].label}
                </span>
              ))}
            </div>
            <p className="rounded-md bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700">
              {data.retention.denominator === 0 ? (
                "최근 7일 수집 기록이 없습니다."
              ) : (
                <>
                  최근 7일 중 <b>{ownDays}일 인용</b> · 인용 유지율 {formatPercent(data.retention.rate)}
                  {data.retention.denominator < 7 && <span className="text-neutral-500"> (측정 {data.retention.denominator}일 기준)</span>}
                </>
              )}
            </p>
          </Card>

          {ownVideos.length === 0 ? (
            <Card className="flex flex-col gap-2 p-6">
              <h2 className="text-base font-bold text-neutral-900">이 영상의 최적화 작업 이력</h2>
              <p className="text-sm text-neutral-500">
                최근 수집에서 우리 채널 영상이 인용되지 않았습니다. 인용되면 영상별 작업 이력과 첫 인용일이 여기에 표시됩니다.
              </p>
            </Card>
          ) : (
            ownVideos.map((video) => <OwnVideoPanel key={video.videoId} video={video} brandId={brandId} demo={demo} device={device} base={base} />)
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "outline" | "youtube" | "own" | "off"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold",
        tone === "outline" && "border border-neutral-300 bg-white text-neutral-800",
        tone === "youtube" && "bg-orange-50 text-orange-700",
        tone === "own" && "bg-blue-600 text-white",
        tone === "off" && "bg-neutral-100 text-neutral-500"
      )}
    >
      {children}
    </span>
  );
}

function VideoThumb({ url }: { url: string | null }) {
  if (!url) return <span className="grid h-12 w-20 shrink-0 place-items-center rounded bg-blue-100 text-[10px] text-blue-600">썸네일</span>;
  // eslint-disable-next-line @next/next/no-img-element -- 외부 YouTube 썸네일, next/image 도메인 설정 없이 그대로 표시
  return <img src={url} alt="" className="h-12 w-20 shrink-0 rounded bg-neutral-100 object-cover" />;
}

function OwnVideoPanel({ video, brandId, demo, device, base }: { video: AioOwnVideoDetail; brandId: string; demo: boolean; device: string; base: string }) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState("");
  const [workType, setWorkType] = useState(WORK_TYPES[0]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeline = [
    ...video.workLogs.map((log) => ({ key: log.id, date: log.workDate, text: log.note ? `${log.workType} — ${log.note}` : log.workType, logId: log.id })),
    ...(video.firstCitedDate ? [{ key: "first", date: video.firstCitedDate, text: "AIO 첫 인용 발생", logId: null as string | null }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.logId === null ? 1 : -1));

  async function add(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/youtube-aio/work-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, videoId: video.videoId, workDate, workType, note }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setError(data?.error ?? "저장하지 못했습니다.");
      return;
    }
    setWorkDate("");
    setNote("");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/youtube-aio/work-logs?brandId=${encodeURIComponent(brandId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(
      () => null
    );
    if (res?.ok) router.refresh();
  }

  return (
    <>
      <Card className="flex flex-col gap-3 p-6">
        <div>
          <h2 className="text-base font-bold text-neutral-900">이 영상의 최적화 작업 이력</h2>
          <p className="mt-0.5 truncate text-xs text-neutral-500" title={video.title}>
            {video.position}위 인용 · {video.title}
            {video.startSeconds !== null && ` · ${formatTimestamp(video.startSeconds)}`}
          </p>
        </div>
        {timeline.length === 0 ? (
          <p className="text-sm text-neutral-500">기록된 작업이 없습니다. 자막·챕터·설명란 작업일을 남기면 첫 인용일과 비교할 수 있습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {timeline.map((item) => (
              <li key={item.key} className="flex items-center gap-4 text-sm">
                <span className={cn("w-12 shrink-0 tabular-nums", item.logId ? "text-neutral-600" : "font-semibold text-blue-600")}>{shortDate(item.date)}</span>
                <span className={cn("flex-1", item.logId ? "text-neutral-800" : "font-semibold text-blue-700")}>{item.text}</span>
                {item.logId && !demo && (
                  <EditOnly>
                    <button
                      type="button"
                      aria-label="작업 이력 삭제"
                      onClick={() => remove(item.logId!)}
                      className="rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </EditOnly>
                )}
              </li>
            ))}
          </ul>
        )}
        {!demo && (
          <EditOnly>
            <form onSubmit={add} className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  required
                  aria-label="작업일"
                  className="h-9 w-36 rounded-md border border-neutral-300 px-2 text-sm"
                />
                <select
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  aria-label="작업 내용"
                  className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                >
                  {WORK_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="메모 (선택)"
                  maxLength={200}
                  className="h-9 flex-1 rounded-md border border-neutral-300 px-2 text-sm"
                />
                <Button type="submit" variant="secondary" size="sm" disabled={pending || !workDate}>
                  {pending ? "저장 중…" : "기록"}
                </Button>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </form>
          </EditOnly>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="text-base font-bold text-neutral-900">이 영상이 인용되는 다른 프롬프트</h2>
        {video.otherKeywords.length === 0 ? (
          <p className="text-sm text-neutral-500">최근 30일 동안 다른 추적 프롬프트에서는 인용되지 않았습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {video.otherKeywords.map((k) => (
              <Link
                key={k.id}
                href={`${base}/youtube-aio/${k.id}?device=${device}`}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                {k.keyword}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
