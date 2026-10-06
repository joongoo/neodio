"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { AioCitedVideo, AioKeywordRow, AioRate } from "@/lib/db";
import type { AioOverviewPageData } from "@/lib/backend/aio/pageData";
import { RangeDropdown } from "@/components/overview/RangeDropdown";
import { AioTrendChart } from "./AioTrendChart";
import { AddAioKeywordsModal } from "./AddAioKeywordsModal";
import { AioCollectButton } from "./AioCollectButton";
import {
  COUNTRY_LABEL,
  DEVICE_LABEL,
  LANGUAGE_LABEL,
  SOURCE_TYPE_LABEL,
  formatPercent,
  formatRate,
  formatKstDateTime,
  formatTimestamp,
  shortDate,
} from "./labels";

// 시안(AIO 인용 트래커 대시보드 1.pdf 2p) 레이아웃 — 색·톤은 앱 기준.
export function YoutubeAioClient({ data }: { data: AioOverviewPageData }) {
  const { overview, settings, device, range, baseDate, demo, brandId, brandName, base } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const baseOptions = [
    ...(settings.optimizationDate ? [`최적화 적용일 (${shortDate(settings.optimizationDate)})`] : []),
    ...(baseDate && baseDate !== settings.optimizationDate ? [`기준일 (${shortDate(baseDate)})`] : []),
    "지난주 대비",
  ];
  const baseValue = baseDate
    ? baseDate === settings.optimizationDate
      ? `최적화 적용일 (${shortDate(baseDate)})`
      : `기준일 (${shortDate(baseDate)})`
    : "지난주 대비";

  const noKeywords = data.totalKeywords === 0;
  const waiting = !noKeywords && overview.measuredKeywords === 0;
  const change = overview.ownCitationChange;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500">YOUTUBE AIO 인용 트래커</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{brandName} YouTube · Google AI Overview 인용 현황</h1>
          <p className="mt-1 text-sm text-neutral-500">
            프롬프트를 Google에서 검색했을 때 AI Overview가 뜨는지, YouTube가 인용되는지, 그중 우리 채널 영상이 인용되는지를 매일 확인합니다.
            {overview.lastCollectedAt && ` · 마지막 수집 ${formatKstDateTime(overview.lastCollectedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">샘플 데이터</span>}
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => downloadCsv(brandName, overview.rows)} disabled={overview.rows.length === 0}>
            스냅샷 내보내기
          </Button>
          <AioCollectButton brandId={brandId} searches={data.totalKeywords * settings.devices.length} disabled={demo || noKeywords} />
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddOpen(true)} disabled={demo}>
            프롬프트 추가
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RangeDropdown value={range} label="기간" />
        <Link
          href={demo ? "#" : `${base}/brands-management/${brandId}/connections`}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3.5 py-2 text-sm text-neutral-700 hover:bg-neutral-200"
          title="수집 조건은 브랜드 관리 > 연결 관리 > AIO 추적 설정에서 바꿉니다"
        >
          지역 · {COUNTRY_LABEL[settings.country] ?? settings.country} / {LANGUAGE_LABEL[settings.language] ?? settings.language}
          <Settings2 size={14} className="text-neutral-400" />
        </Link>
        <Dropdown
          label="디바이스"
          value={DEVICE_LABEL[device]}
          options={settings.devices.map((d) => DEVICE_LABEL[d])}
          onChange={(label) => setParam("device", settings.devices.find((d) => DEVICE_LABEL[d] === label) ?? null)}
        />
        <Dropdown
          label="비교 기준"
          value={baseValue}
          options={baseOptions}
          onChange={(label) => setParam("base", label === "지난주 대비" ? "none" : label.startsWith("최적화") ? null : baseDate)}
        />
      </div>

      {noKeywords ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-base font-bold text-neutral-900">추적할 프롬프트를 추가하세요</p>
          <p className="max-w-md text-sm text-neutral-500">
            프롬프트를 등록하면 Google에서 검색해 AI Overview에 어떤 YouTube 영상이 인용되는지 기록합니다. 프롬프트 라이브러리에서 Google AI Overview 플랫폼을 켠 프롬프트도 여기에 나옵니다.
          </p>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            프롬프트 추가
          </Button>
        </Card>
      ) : (
        <>
          {waiting && (
            <div className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
              <b>첫 수집 대기 중</b> — 프롬프트 {data.totalKeywords}개가 등록됐습니다. 상단 &quot;지금 수집&quot;을 누르거나 정기 수집이 한 번 돌면 아래 지표가 채워집니다. 아직 측정하지 않은 값은 0%가 아니라 &quot;–&quot;로 표시됩니다.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <AioStatCard
              label="추적 프롬프트"
              value={overview.trackedKeywords.toLocaleString("ko-KR")}
              sub={`측정 ${overview.measuredKeywords}개 · ${settings.devices.length > 1 ? `${DEVICE_LABEL[device]} 기준` : "일 1회 수집"}`}
              tooltip="등록된 프롬프트 수. 측정은 기간 내 수집에 성공한 프롬프트 수입니다."
            />
            <AioStatCard
              label="AIO 노출률"
              value={formatRate(overview.aioExposure)}
              sub={fraction(overview.aioExposure, "프롬프트")}
              tooltip="AI Overview가 뜬 프롬프트 ÷ 측정된 프롬프트. Google이 AIO를 띄우는 정도로, 직접 통제하기 어렵습니다."
            />
            <AioStatCard
              label="YouTube 인용률"
              value={formatRate(overview.youtubeCitation)}
              sub={fraction(overview.youtubeCitation, "AIO")}
              tooltip="YouTube 영상이 인용된 AIO ÷ AIO가 뜬 프롬프트. 영상으로 공략 가능한 프롬프트의 비중입니다."
            />
            <AioStatCard
              highlight
              label={`${brandName} 채널 인용률`}
              value={formatRate(overview.ownCitation)}
              delta={change.pp}
              sub={`${fraction(overview.ownCitation, "AIO")} · ${
                change.pp === null ? "비교할 이전 수집 없음" : change.basis === "optimization" ? "최적화 전 대비" : "지난주 대비"
              }`}
              tooltip="우리 채널 영상이 인용된 AIO ÷ AIO가 뜬 프롬프트. 분모에서 AIO가 안 뜬 프롬프트를 빼야 최적화 성과가 왜곡되지 않습니다. 변화는 %p입니다."
            />
            <AioStatCard
              label="인용된 우리 영상"
              value={overview.ownCitation.denominator === 0 ? "–" : `${overview.citedOwnVideos}개`}
              sub={overview.averageOwnPosition === null ? "평균 인용 순서 –" : `평균 인용 순서 ${overview.averageOwnPosition}위`}
              tooltip="현재 AIO에 인용 중인 우리 채널 영상 수(중복 제외)와, 인용 목록에서의 평균 위치(앞일수록 좋음)."
            />
          </div>

          {data.deviceSummaries.length > 1 && <DeviceCompareCard summaries={data.deviceSummaries} selected={device} brandName={brandName} onSelect={(d) => setParam("device", d)} />}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3 p-5 lg:col-span-2">
              <h2 className="text-base font-bold text-neutral-900">{overview.trendGranularity === "day" ? "일별 추이" : "주간 추이"}</h2>
              <AioTrendChart trend={overview.trend} granularity={overview.trendGranularity} optimizationLabel={overview.optimizationLabel} />
            </Card>
            <Card className="flex flex-col gap-4 p-5">
              <div>
                <h2 className="text-base font-bold text-neutral-900">AIO 인용 소스 점유율</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  전체 인용 링크 기준 · 우리 영상 점유율(SoV) {formatRate(overview.shareOfVoice)}
                </p>
              </div>
              <ul className="flex flex-col gap-3.5">
                {overview.sourceShare.map((s) => (
                  <li key={s.type} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className={cn(s.type === "own_video" ? "font-semibold text-neutral-900" : "text-neutral-700")}>
                        {s.type === "own_video" ? `YouTube · ${brandName} 채널` : SOURCE_TYPE_LABEL[s.type]}
                      </span>
                      <span className="tabular-nums text-neutral-600">
                        {overview.sourceShare.some((x) => x.count > 0) ? formatPercent(s.share) : "–"}
                        <span className="ml-1 text-xs text-neutral-400">({s.count})</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className={cn("h-full rounded-full", SHARE_BAR[s.type])}
                        style={{ width: `${Math.round(s.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {overview.sourceShare.find((s) => s.type === "competitor")?.count === 0 && (
                <p className="text-xs text-neutral-500">
                  경쟁사 사이트는 브랜드 설정의 &quot;기타 브랜드&quot;(영문 이름) 기준으로 분류됩니다.
                </p>
              )}
            </Card>
          </div>

          <Card className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">프롬프트별 인용 현황</h2>
              <p className="text-xs text-neutral-500">AIO에서 YouTube가 인용됐을 때 어떤 프롬프트에서 어떤 영상이 인용됐는지 보여 줍니다. 행을 누르면 그 프롬프트의 AIO 스냅샷(상세)으로 이동합니다</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs text-neutral-500">
                    <th className="rounded-l-md px-3 py-2.5 font-medium">프롬프트</th>
                    <th className="px-3 py-2.5 font-medium">AIO</th>
                    <th className="px-3 py-2.5 font-medium">인용된 YouTube 영상</th>
                    <th className="rounded-r-md px-3 py-2.5 font-medium">수집일</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.rows.map((row) => (
                    <PromptRow key={row.keywordId} row={row} href={`${base}/youtube-aio/${row.keywordId}?device=${device}`} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {!demo && <AddAioKeywordsModal open={addOpen} onClose={() => setAddOpen(false)} brandId={brandId} />}
    </div>
  );
}

const SHARE_BAR: Record<string, string> = {
  own_video: "bg-blue-500",
  other_youtube: "bg-orange-400",
  own_web: "bg-slate-500",
  competitor: "bg-slate-400",
  other: "bg-slate-300",
};

function fraction(rate: AioRate, unit: string) {
  return `${rate.numerator} / ${rate.denominator} ${unit}`;
}

function AioStatCard({
  label,
  value,
  sub,
  tooltip,
  delta,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  tooltip: string;
  delta?: number | null;
  highlight?: boolean;
}) {
  return (
    // Card는 bg-white가 고정이고 cn은 클래스를 병합하지 않으므로, 강조(어두운)
    // 카드는 배경을 직접 고른다.
    <div className={cn("flex flex-col gap-2 rounded-xl border p-4", highlight ? "border-slate-800 bg-slate-800" : "border-neutral-200 bg-white")}>
      <span className={cn("flex items-center gap-1 text-xs font-medium", highlight ? "text-slate-300" : "text-neutral-500")}>
        {label}
        <Tooltip text={tooltip} />
      </span>
      <span className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tabular-nums", highlight ? "text-white" : "text-neutral-900")}>{value}</span>
        {delta !== undefined && delta !== null && (
          <span className={cn("text-xs font-semibold", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-slate-300")}>
            {delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}
            {Math.abs(delta)}%p
          </span>
        )}
      </span>
      <span className={cn("text-xs", highlight ? "text-slate-300" : "text-neutral-500")}>{sub}</span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "own" | "youtube" | "off"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "own" && "bg-blue-50 text-blue-700",
        tone === "youtube" && "bg-orange-50 text-orange-700",
        tone === "off" && "bg-neutral-100 text-neutral-500"
      )}
    >
      {children}
    </span>
  );
}

const MAX_VIDEOS_SHOWN = 3;

function videoUrl(video: AioCitedVideo) {
  return `https://www.youtube.com/watch?v=${video.videoId}${video.startSeconds ? `&t=${video.startSeconds}s` : ""}`;
}

function videoSummary(video: AioCitedVideo) {
  const channel = video.own ? `${video.channelTitle ?? "우리"} 채널` : video.channelTitle ?? "다른 채널";
  return `${video.title} (${channel} · ${video.position}번째${video.startSeconds !== null ? ` · ${formatTimestamp(video.startSeconds)}` : ""})`;
}

// 프롬프트 한 줄 — AIO에서 인용된 YouTube 영상을 그대로 보여 준다(우리 채널은 강조).
function PromptRow({ row, href }: { row: AioKeywordRow; href: string }) {
  const router = useRouter();
  const present = row.status === "aio_present";
  const shown = row.youtubeVideos.slice(0, MAX_VIDEOS_SHOWN);
  return (
    <tr
      onClick={() => router.push(href)}
      className={cn("cursor-pointer border-b border-neutral-100 align-top hover:bg-neutral-50", row.hasOwn && "bg-blue-50/30")}
    >
      <td className="px-3 py-3 font-medium text-neutral-900">
        <Link href={href} onClick={(e) => e.stopPropagation()} className="hover:underline">
          {row.keyword}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-3 font-medium text-neutral-800">{row.status === "unmeasured" ? "–" : present ? "노출" : "없음"}</td>
      <td className="px-3 py-3">
        {row.status === "unmeasured" ? (
          <span className="text-neutral-400">아직 수집되지 않음</span>
        ) : !present ? (
          <span className="text-neutral-400">AIO가 뜨지 않음</span>
        ) : shown.length === 0 ? (
          <span className="text-neutral-500">YouTube 인용 없음</span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map((video) => (
              <li key={video.videoId} className="flex items-start gap-2">
                <Pill tone={video.own ? "own" : "youtube"}>{video.own ? "우리 채널" : "타 채널"}</Pill>
                <a
                  href={videoUrl(video)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={videoSummary(video)}
                  className={cn("min-w-0 max-w-[280px] truncate hover:underline", video.own ? "font-medium text-neutral-900" : "text-neutral-700")}
                >
                  {video.title}
                </a>
                <span className="shrink-0 whitespace-nowrap text-xs text-neutral-500">
                  {video.channelTitle ? `${video.channelTitle} · ` : ""}
                  {video.position}번째{video.startSeconds !== null ? ` · ${formatTimestamp(video.startSeconds)}` : ""}
                </span>
              </li>
            ))}
            {row.youtubeVideos.length > shown.length && <li className="text-xs text-neutral-400">외 {row.youtubeVideos.length - shown.length}개</li>}
          </ul>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-neutral-500">{row.collectedDate ? shortDate(row.collectedDate) : "—"}</td>
    </tr>
  );
}

// "스냅샷 내보내기" — 지금 화면의 프롬프트별 현황을 CSV로. 엑셀에서 한글이
// 깨지지 않게 BOM을 붙인다.
function downloadCsv(brandName: string, rows: AioKeywordRow[]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["프롬프트", "AIO", "인용된 YouTube 영상", "수집일"];
  const lines = rows.map((row) => {
    const present = row.status === "aio_present";
    return [
      row.keyword,
      row.status === "unmeasured" ? "미측정" : present ? "노출" : "없음",
      row.youtubeVideos.map((video) => `${video.own ? "[우리 채널] " : ""}${videoSummary(video)} ${videoUrl(video)}`).join("\n"),
      row.collectedDate ?? "",
    ]
      .map(escape)
      .join(",");
  });
  const blob = new Blob([`\ufeff${[header.map(escape).join(","), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${brandName}-youtube-aio-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}



function DeviceCompareCard({
  summaries,
  selected,
  brandName,
  onSelect,
}: {
  summaries: AioOverviewPageData["deviceSummaries"];
  selected: string;
  brandName: string;
  onSelect: (device: string) => void;
}) {
  const rows: { label: string; value: (o: AioOverviewPageData["overview"]) => string }[] = [
    { label: "측정 프롬프트", value: (o) => `${o.measuredKeywords} / ${o.trackedKeywords}개` },
    { label: "AIO 노출률", value: (o) => formatRate(o.aioExposure) },
    { label: "YouTube 인용률", value: (o) => formatRate(o.youtubeCitation) },
    { label: `${brandName} 채널 인용률`, value: (o) => formatRate(o.ownCitation) },
    { label: "인용된 우리 영상", value: (o) => (o.ownCitation.denominator === 0 ? "–" : `${o.citedOwnVideos}개`) },
  ];
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-base font-bold text-neutral-900">기기별 현황</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="py-1.5 font-medium">지표</th>
              {summaries.map((s) => (
                <th key={s.device} className="py-1.5 text-right font-medium">
                  <button type="button" onClick={() => onSelect(s.device)} className={cn("rounded px-2 py-0.5 hover:bg-neutral-100", s.device === selected && "bg-neutral-100 font-bold text-neutral-900")}>
                    {DEVICE_LABEL[s.device]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-neutral-100">
                <td className="py-2 text-neutral-700">{row.label}</td>
                {summaries.map((s) => (
                  <td key={s.device} className="py-2 pr-2 text-right tabular-nums text-neutral-900">
                    {row.value(s.overview)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">기기 이름을 누르면 아래 추이·표가 그 기기 기준으로 바뀝니다.</p>
    </Card>
  );
}
