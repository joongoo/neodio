"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { Dropdown } from "@/components/ui/Dropdown";
import { Pagination } from "@/components/ui/Pagination";
import { Tooltip } from "@/components/ui/Tooltip";
import { usePagedRows } from "@/lib/usePagedRows";
import { cn } from "@/lib/cn";
import type { VideoManageListData, VideoManageRow } from "@/lib/backend/aio/videoManagePageData";
import { RECENT_DAYS, publishedDate } from "@/lib/videoManage";
import { DEVICE_LABEL } from "@/components/youtube-aio/labels";
import { VideoPromptModal } from "./VideoPromptModal";

type Filter = "all" | "checked";

// YouTube 관리 — 채널 영상을 전부 가져와 두고, 체크한 영상만 예상 프롬프트를 만들어 Google AIO 인용을 추적한다.
export function YoutubeManageClient({ data }: { data: VideoManageListData }) {
  const { base, demo, brandId, brandName, industry, settings, device, existingPrompts, canSync } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [videos, setVideos] = useState(data.videos);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // 서버에서 새로 받은 목록(가져오기·프롬프트 등록 뒤 refresh)을 반영한다.
  const [lastData, setLastData] = useState(data.videos);
  if (lastData !== data.videos) {
    setLastData(data.videos);
    setVideos(data.videos);
  }

  const checkedCount = videos.filter((v) => v.checked).length;
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ko-KR");
    return videos.filter((v) => (filter === "all" || v.checked) && (!q || v.title.toLocaleLowerCase("ko-KR").includes(q)));
  }, [videos, filter, query]);
  const { page, setPage, pageCount, pageRows, pageSize, setPageSize } = usePagedRows(filtered, 20);

  async function setChecked(videoIds: string[], checked: boolean) {
    if (demo || videoIds.length === 0) return;
    const before = videos;
    setVideos((prev) => prev.map((v) => (videoIds.includes(v.videoId) ? { ...v, checked } : v)));
    const res = await fetch("/api/youtube-manage/videos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, videoIds, checked }),
    }).catch(() => null);
    if (!res?.ok) {
      setVideos(before);
      setNotice({ kind: "error", text: "체크를 저장하지 못했습니다. 다시 시도해 주세요." });
    }
  }

  async function sync() {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/youtube-manage/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: "error", text: body?.error ?? "영상을 가져오지 못했습니다." });
        return;
      }
      setNotice({ kind: "ok", text: body.added > 0 ? `새 영상 ${body.added}개를 가져왔습니다. (확인한 영상 ${body.total}개)` : `새 영상이 없습니다. (확인한 영상 ${body.total}개)` });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "영상을 가져오지 못했습니다. 네트워크를 확인해 주세요." });
    } finally {
      setSyncing(false);
    }
  }

  function setDevice(label: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = settings.devices.find((d) => DEVICE_LABEL[d] === label);
    if (next) params.set("device", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  const pageAllChecked = pageRows.length > 0 && pageRows.every((v) => v.checked);
  const columns: DataTableColumn<VideoManageRow>[] = [
    {
      key: "check",
      width: "w-8",
      label: (
        <input
          type="checkbox"
          aria-label="현재 페이지 전체 선택"
          checked={pageAllChecked}
          disabled={demo}
          onChange={(e) => void setChecked(pageRows.map((v) => v.videoId), e.target.checked)}
          className="size-4 cursor-pointer accent-slate-800"
        />
      ),
      render: (v) => (
        <input
          type="checkbox"
          aria-label={`${v.title} 체크`}
          checked={v.checked}
          disabled={demo}
          onChange={(e) => void setChecked([v.videoId], e.target.checked)}
          className="size-4 cursor-pointer accent-slate-800"
        />
      ),
    },
    {
      key: "video",
      label: "영상",
      render: (v) => (
        <Link href={`${base}/youtube-manage/${v.videoId}${searchParams.get("device") ? `?device=${searchParams.get("device")}` : ""}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.thumbnailUrl} alt="" className="h-9 w-16 shrink-0 rounded object-cover" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-neutral-900">{v.title}</span>
            {!v.ownChannel && <span className="text-[10px] font-bold text-amber-700">타 채널{v.channelTitle ? ` · ${v.channelTitle}` : ""}</span>}
          </span>
        </Link>
      ),
    },
    { key: "published", label: "게시일", width: "w-24", render: (v) => <span className="text-neutral-600">{publishedDate(v.publishedAt)}</span> },
    {
      key: "prompts",
      label: "예상 프롬프트",
      width: "w-28",
      align: "right",
      render: (v) => (v.promptCount > 0 ? <b>{v.promptCount}개</b> : <span className="text-neutral-400">{v.checked ? "아직 없음" : "–"}</span>),
    },
    {
      key: "cited",
      width: "w-32",
      align: "right",
      label: (
        <span className="flex items-center justify-end gap-1">
          AIO 인용 프롬프트
          <Tooltip text={`최근 ${RECENT_DAYS}일 안에 Google AI Overview가 이 영상을 인용한 프롬프트 수(${DEVICE_LABEL[device]} 기준). 그 기간에 수집이 없었으면 –로 표시합니다.`} />
        </span>
      ),
      render: (v) =>
        v.recentCitingPrompts === null ? (
          <span className="text-neutral-400">–</span>
        ) : v.recentCitingPrompts > 0 ? (
          <b className="text-emerald-700">{v.recentCitingPrompts}개</b>
        ) : (
          <span className="text-neutral-500">0개</span>
        ),
    },
    { key: "last", label: "마지막 인용", width: "w-24", align: "right", render: (v) => <span className="text-neutral-600">{v.lastCitedDate ? v.lastCitedDate.slice(5).replace("-", "/") : "–"}</span> },
  ];

  const candidates = videos
    .filter((v) => v.checked)
    .sort((a, b) => a.promptCount - b.promptCount)
    .map((v) => ({ videoId: v.videoId, title: v.title, description: v.description, thumbnailUrl: v.thumbnailUrl, promptCount: v.promptCount }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500">YOUTUBE 관리</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{brandName} YouTube 영상 관리</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            채널의 영상을 가져와 두고, 관리할 영상을 체크하면 그 영상이 답이 될 예상 프롬프트를 만들어 추적합니다. 영상을 열면 어떤 프롬프트에서 인용됐는지 볼 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">샘플 데이터</span>}
          <Button
            variant="secondary"
            icon={syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            onClick={() => void sync()}
            disabled={demo || syncing || !canSync}
            title={canSync ? undefined : "서버에 YouTube API 키가 설정되어야 채널 영상을 가져올 수 있습니다"}
          >
            {syncing ? "가져오는 중..." : "영상 가져오기"}
          </Button>
          <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => setModalOpen(true)} disabled={demo || checkedCount === 0}>
            예상 프롬프트 만들기{checkedCount > 0 ? ` (${checkedCount})` : ""}
          </Button>
        </div>
      </div>

      {!canSync && !demo && (
        <div className="rounded-lg bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
          채널 영상을 자동으로 가져오려면 서버에 <b>YouTube API 키</b>가 필요합니다. 키가 설정되기 전에는 아래 목록에 이미 등록된 영상만 보입니다.
        </div>
      )}
      {notice && (
        <div className={cn("rounded-lg px-4 py-3 text-sm", notice.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{notice.text}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-2">
          <Search size={14} className="text-neutral-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="영상 제목 검색"
            aria-label="영상 제목 검색"
            className="w-48 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
        </div>
        <div className="flex rounded-md bg-neutral-100 p-0.5 text-sm">
          {(["all", "checked"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={cn("rounded px-3 py-1.5 cursor-pointer", filter === f ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900")}
            >
              {f === "all" ? `전체 ${videos.length}` : `체크됨 ${checkedCount}`}
            </button>
          ))}
        </div>
        {settings.devices.length > 1 && <Dropdown label="디바이스" value={DEVICE_LABEL[device]} options={settings.devices.map((d) => DEVICE_LABEL[d])} onChange={setDevice} />}
      </div>

      {videos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-base font-bold text-neutral-900">아직 가져온 영상이 없습니다</p>
          <p className="max-w-md text-sm text-neutral-500">
            &quot;영상 가져오기&quot;를 누르면 연결된 채널의 공개 영상을 최신순으로 최대 500개까지 가져옵니다. 이후에는 새 영상이 올라올 때 버튼으로 다시 가져오세요.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-12 text-center text-sm text-neutral-500">조건에 맞는 영상이 없습니다.</Card>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <DataTable columns={columns} rows={pageRows} getRowId={(v) => v.videoId} />
          <div className="p-4">
            <Pagination page={page} pageCount={pageCount} pageSize={pageSize} totalCount={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </div>
      )}

      {modalOpen && (
        <VideoPromptModal
          key={candidates.map((c) => c.videoId).join(",")}
          open
          onClose={() => setModalOpen(false)}
          brandId={brandId}
          brandName={brandName}
          industry={industry}
          candidates={candidates}
          existingPrompts={existingPrompts}
          onRegistered={(count) => {
            setNotice({ kind: "ok", text: `예상 프롬프트 ${count}개를 프롬프트 라이브러리에 등록했습니다. 선택한 표면에서 수집이 시작됩니다.` });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
