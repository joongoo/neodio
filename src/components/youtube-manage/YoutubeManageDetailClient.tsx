"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { SurfaceChips } from "@/components/prompt-library/SurfacePicker";
import { DEVICE_LABEL, formatTimestamp } from "@/components/youtube-aio/labels";
import { RECENT_DAYS, publishedDate } from "@/lib/videoManage";
import type { PromptSurface } from "@/lib/promptSurfaces";
import type { VideoManageDetailData } from "@/lib/backend/aio/videoManagePageData";
import { VideoPromptModal } from "./VideoPromptModal";

const shortDate = (date: string) => date.slice(5).replace("-", "/");

// 영상 하나의 상세 — 이 영상용으로 만든 예상 프롬프트와, Google AI Overview가 이 영상을 어떤 프롬프트에서 인용했는지.
export function YoutubeManageDetailClient({ data }: { data: VideoManageDetailData }) {
  const { base, demo, brandId, brandName, industry, existingPrompts, device, devices, video, prompts, citedBy, measured } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const deviceQuery = searchParams.get("device") ? `?device=${searchParams.get("device")}` : "";

  function setDevice(label: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = devices.find((d) => DEVICE_LABEL[d] === label);
    if (next) params.set("device", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function check() {
    setChecking(true);
    try {
      const res = await fetch("/api/youtube-manage/videos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, videoIds: [video.videoId], checked: true }),
      });
      if (res.ok) router.refresh();
      else setNotice("체크하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setChecking(false);
    }
  }

  const watchUrl = (seconds?: number) => `https://www.youtube.com/watch?v=${video.videoId}${seconds ? `&t=${seconds}s` : ""}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <Link href={`${base}/youtube-manage${deviceQuery}`} className="inline-flex w-fit items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <ArrowLeft size={14} /> YouTube 관리
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={video.thumbnailUrl} alt="" className="h-20 w-36 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <a href={watchUrl()} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-xl font-semibold text-neutral-900 hover:underline">
              {video.title}
              <ExternalLink size={14} className="mt-1.5 shrink-0 text-neutral-400" />
            </a>
            <p className="mt-1 text-sm text-neutral-500">
              {video.channelTitle ?? "채널 미확인"}
              {!video.ownChannel && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">타 채널</span>}
              {video.publishedAt && ` · 게시 ${publishedDate(video.publishedAt)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">샘플 데이터</span>}
          {devices.length > 1 && <Dropdown label="디바이스" value={DEVICE_LABEL[device]} options={devices.map((d) => DEVICE_LABEL[d])} onChange={setDevice} />}
          {video.checked ? (
            <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => setModalOpen(true)} disabled={demo}>
              예상 프롬프트 만들기
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void check()} disabled={demo || checking}>
              {checking ? "체크하는 중..." : "관리 대상으로 체크"}
            </Button>
          )}
        </div>
      </div>
      {notice && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{notice}</div>}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-neutral-900">이 영상용 예상 프롬프트</h2>
          <p className="mt-0.5 text-xs text-neutral-500">이 영상이 답이 될 질문으로 만들어 프롬프트 라이브러리에 등록한 프롬프트입니다. Google AIO 결과는 {DEVICE_LABEL[device]} 기준입니다.</p>
        </div>
        {prompts.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-8 text-center text-xs text-neutral-500">
            {video.checked ? "아직 만든 예상 프롬프트가 없습니다. 위의 \"예상 프롬프트 만들기\"를 눌러 보세요." : "관리 대상으로 체크하면 예상 프롬프트를 만들 수 있습니다."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 pr-3 font-semibold">프롬프트</th>
                  <th className="w-40 py-2 pr-3 font-semibold">수집 표면</th>
                  <th className="w-56 py-2 font-semibold">Google AIO 인용</th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => (
                  <tr key={p.promptId} className="border-b border-neutral-100 last:border-b-0">
                    <td className="py-2.5 pr-3 text-neutral-800">{p.text}</td>
                    <td className="py-2.5 pr-3">
                      <SurfaceChips surfaces={p.surfaces as PromptSurface[]} />
                    </td>
                    <td className="py-2.5">
                      {!p.aioTracked ? (
                        <span className="text-neutral-400">AIO 수집 안 함</span>
                      ) : p.lastCitedDate ? (
                        <span className="font-medium text-emerald-700">
                          인용됨 · 마지막 {shortDate(p.lastCitedDate)}
                          {p.lastPosition ? ` · ${p.lastPosition}번째 출처` : ""}
                        </span>
                      ) : p.aioMeasured ? (
                        <span className="text-neutral-500">수집했지만 인용 없음</span>
                      ) : (
                        <span className="text-neutral-400">수집 전 (–)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-neutral-900">이 영상을 인용한 프롬프트 (Google AI Overview)</h2>
          <p className="mt-0.5 text-xs text-neutral-500">이 영상용으로 만들지 않은 프롬프트에서 인용된 경우도 포함합니다. 수집한 기록 전체 기준입니다.</p>
        </div>
        {citedBy.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-8 text-center text-xs text-neutral-500">
            {measured
              ? `이 영상이 Google AI Overview에 인용된 기록이 없습니다. (최근 ${RECENT_DAYS}일 수집은 진행 중)`
              : `최근 ${RECENT_DAYS}일 안에 ${DEVICE_LABEL[device]} Google AIO 수집이 없어 인용 여부를 알 수 없습니다.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 pr-3 font-semibold">프롬프트</th>
                  <th className="w-24 py-2 pr-3 font-semibold">마지막 인용</th>
                  <th className="w-20 py-2 pr-3 text-right font-semibold">출처 순위</th>
                  <th className="w-40 py-2 pr-3 font-semibold">인용 구간</th>
                  <th className="w-24 py-2 text-right font-semibold">인용된 날</th>
                </tr>
              </thead>
              <tbody>
                {citedBy.map((c) => (
                  <tr key={c.keywordId} className="border-b border-neutral-100 last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <Link href={`${base}/youtube-aio/${c.keywordId}${deviceQuery}`} className="text-neutral-800 hover:underline">
                        {c.keyword}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-neutral-600">{shortDate(c.lastCitedDate)}</td>
                    <td className="py-2.5 pr-3 text-right text-neutral-600">{c.lastPosition}</td>
                    <td className="py-2.5 pr-3">
                      {c.startSeconds.length === 0 ? (
                        <span className="text-neutral-400">영상 전체</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {c.startSeconds.map((s) => (
                            <a key={s} href={watchUrl(s)} target="_blank" rel="noreferrer" className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 hover:bg-neutral-200">
                              {formatTimestamp(s)}
                            </a>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right text-neutral-600">{c.citedDays}일</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <VideoPromptModal
          open
          onClose={() => setModalOpen(false)}
          brandId={brandId}
          brandName={brandName}
          industry={industry}
          candidates={[{ videoId: video.videoId, title: video.title, description: video.description, thumbnailUrl: video.thumbnailUrl, promptCount: video.promptCount }]}
          existingPrompts={existingPrompts}
          onRegistered={() => router.refresh()}
        />
      )}
    </div>
  );
}
