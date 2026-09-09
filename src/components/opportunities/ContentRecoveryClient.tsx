"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileCheck2, Loader2, RefreshCw, Settings, Sparkles } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { ContentRecoveryOpportunity, ContentRecoveryUrl } from "@/lib/db";

const OPTIONAL_COLUMNS: ColumnOption[] = [
  { key: "contentVisibility", label: "가시성 %" },
  { key: "priorityScore", label: "우선순위 점수" },
];

const TABS = ["현재 제안", "수정 완료"] as const;

export function ContentRecoveryClient({ data }: { data: ContentRecoveryOpportunity }) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("현재 제안");
  // url -> job 진행 상태. 재크롤은 URL당 하나씩, 여러 개 동시에 돌려도 되게
  // id별로 관리한다.
  const [recheckJobs, setRecheckJobs] = useState<Record<string, { jobId: string; stage: string; done: boolean; error: string | null }>>({});
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
    };
  }, []);

  const rowsByTab: Record<(typeof TABS)[number], ContentRecoveryUrl[]> = {
    "현재 제안": data.urls.filter((u) => u.status !== "optimized"),
    "수정 완료": data.urls.filter((u) => u.status === "optimized"),
  };
  const rows = rowsByTab[tab];

  // "수정 완료" 확인 — 배포는 하지 않는다. 이 URL 하나만 다시 크롤링해서
  // raw HTML 대비 렌더링 비율(콘텐츠 가시성)이 기준을 넘었는지만 검토한다.
  // 넘었으면 다음 로드부터 자동으로 "수정 완료" 탭으로 옮겨가고, 못 넘었으면
  // "현재 제안"에 그대로 남는다 — 사람이 직접 완료 처리하는 버튼이 아니라
  // 실측으로 판정한다.
  async function recheckUrl(url: string) {
    const res = await fetch("/api/sitemap-crawl/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: new URL(url).hostname, urls: [url] }),
    });
    const body = await res.json();
    if (!res.ok) {
      window.alert(body.error ?? "재크롤을 시작하지 못했습니다.");
      return;
    }
    setRecheckJobs((prev) => ({ ...prev, [url]: { jobId: body.jobId, stage: "install", done: false, error: null } }));

    const poll = async () => {
      const statusRes = await fetch(`/api/sitemap-crawl/status?jobId=${body.jobId}`);
      if (!statusRes.ok) return;
      const statusBody = await statusRes.json();
      setRecheckJobs((prev) => ({
        ...prev,
        [url]: { jobId: body.jobId, stage: statusBody.stage, done: statusBody.done, error: statusBody.error },
      }));
      if (statusBody.done) {
        clearInterval(pollRefs.current[url]);
        delete pollRefs.current[url];
        if (!statusBody.error) router.refresh();
      }
    };
    poll();
    pollRefs.current[url] = setInterval(poll, 1500);
  }

  const columns: DataTableColumn<ContentRecoveryUrl>[] = [
    { key: "url", label: "전체 도메인 URL", render: (r) => <span className="text-blue-600">{r.url}</span> },
    {
      key: "contentVisibility",
      label: "가시성 %",
      width: "w-[140px]",
      render: (r) =>
        r.previousContentVisibility !== undefined ? (
          <span className="flex items-center gap-1 text-xs">
            <span className="text-neutral-400">{r.previousContentVisibility}%</span>
            <span className="text-neutral-300">→</span>
            <span className="font-bold text-neutral-800">{r.contentVisibility}%</span>
          </span>
        ) : (
          `${r.contentVisibility}%`
        ),
    },
    { key: "priorityScore", label: "우선순위 점수", width: "w-[110px]", render: (r) => r.priorityScore.toFixed(1) },
    {
      key: "action",
      label: "액션",
      width: "w-[160px]",
      render: (r) => {
        const job = recheckJobs[r.url];
        if (r.status === "optimized") {
          return <span className="text-[11px] font-bold text-emerald-600">기준 통과 (70% 이상)</span>;
        }
        if (job && !job.done) {
          return (
            <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 size={12} className="animate-spin" /> 재크롤 중...
            </span>
          );
        }
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              recheckUrl(r.url);
            }}
            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
          >
            <RefreshCw size={12} />
            수정 완료 확인
          </button>
        );
      },
    },
  ];

  const cols = useColumnVisibility(columns, OPTIONAL_COLUMNS);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6 pb-10">
      <a href="/opportunities" className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        기회 목록으로 돌아가기
      </a>

      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold text-neutral-900">{data.title}</h1>
        <div className="flex gap-7">
          <StatPair value={data.affectedUrls} label="URL" />
          <StatPair value={`+${data.expectedVisibilityMultiplier}x`} label="예상 콘텐츠 증가율" />
          <StatPair value={`${data.averageContentVisibility}%`} label="평균 콘텐츠 가시성" />
        </div>
      </div>

      <div className="flex gap-2">
        <span className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600">기술적 GEO</span>
        <span className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] text-neutral-600">
          업데이트: {new Date().toLocaleDateString("ko-KR")}
        </span>
      </div>

      <section className="rounded-xl bg-blue-50/60 px-6 py-5">
        <h2 className="text-[17px] font-bold text-neutral-900">개요</h2>
        <p className="mt-3 rounded-lg bg-white p-5 text-[13px] leading-relaxed text-neutral-700">{data.description}</p>
      </section>

      {data.comparison && (
        <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
          <h2 className="text-[17px] font-bold text-neutral-900">전/후 비교</h2>
          <p className="mt-1 text-xs text-neutral-500">
            같은 사이트맵을 다시 크롤링해서 얻은 실측 비교입니다. 배포 없이 재크롤만 반복해서 측정합니다.
          </p>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-neutral-400">
                {new Date(data.comparison.baselineCrawledAt).toLocaleDateString("ko-KR")} (최초)
              </span>
              <span className="text-2xl font-bold text-neutral-500">{data.comparison.baselineAverageContentVisibility}%</span>
            </div>
            <span className="text-xl text-neutral-300">→</span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-neutral-400">
                {new Date(data.comparison.latestCrawledAt).toLocaleDateString("ko-KR")} (최신)
              </span>
              <span className="text-2xl font-bold text-neutral-900">{data.comparison.latestAverageContentVisibility}%</span>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                data.comparison.improvementPercent >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {data.comparison.improvementPercent >= 0 ? "+" : ""}
              {data.comparison.improvementPercent}%
            </span>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-neutral-400" />
          <h2 className="text-[15px] font-bold text-neutral-700">LLM 기반 수정 가이드</h2>
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">준비 중</span>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          LLM API 연동 후, 가시성이 낮은 각 페이지를 어떻게 수정하면 좋을지(콘텐츠 단순화, 요약 추가, FAQ 보강 등) 구체적인 가이드를 자동으로 제안할 예정입니다.
        </p>
      </section>

      <section className="rounded-xl bg-blue-50/60 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-bold text-neutral-900">제안이 있는 URL</h2>
          <button
            type="button"
            aria-label="컬럼 설정"
            onClick={() => cols.setOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-blue-100/60 p-3 text-xs text-blue-900">
          <FileCheck2 size={14} className="mt-0.5 shrink-0" />
          콘텐츠를 수정한 뒤 "수정 완료 확인"을 누르면 그 URL만 다시 크롤링해서 콘텐츠 가시성이 70% 이상인지 실측으로 검토합니다. 기준을 넘으면 자동으로 "수정 완료"로 이동하고, 못 넘으면 계속 "현재 제안"에 남습니다.
        </p>

        <div className="mt-4 flex gap-6 border-b border-neutral-200">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer border-b-2 pb-2 text-[13px] font-bold ${
                tab === t ? "border-slate-800 text-slate-800" : "border-transparent text-neutral-400"
              }`}
            >
              {t} ({rowsByTab[t].length})
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-white">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-neutral-400">이 상태의 URL이 없습니다.</p>
          ) : (
            <DataTable columns={cols.filtered} rows={rows} getRowId={(r) => r.id} />
          )}
        </div>
        <ConfigureColumnsModal open={cols.open} onClose={() => cols.setOpen(false)} columns={OPTIONAL_COLUMNS} visible={cols.visible} onApply={cols.setVisible} />
      </section>
    </div>
  );
}

function StatPair({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xl font-bold text-neutral-900">{value}</span>
      <span className="text-[11px] text-neutral-500">{label}</span>
    </div>
  );
}
