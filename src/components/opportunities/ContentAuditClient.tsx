"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileCheck2, Loader2, RefreshCw, Settings, Sparkles, XCircle } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { LlmBridgeModal } from "@/components/ui/LlmBridgeModal";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { GoogleIndexBadge } from "@/components/ui/GoogleIndexBadge";
import { PageSpeedBadge } from "@/components/ui/PageSpeedBadge";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { ContentAuditOpportunity, ContentAuditUrl, GscSearchAppearanceRow } from "@/lib/db";

const OPTIONAL_COLUMNS: ColumnOption[] = [
  { key: "priorityScore", label: "우선순위 점수" },
  { key: "googleIndex", label: "구글 인덱싱" },
  { key: "pageSpeed", label: "페이지 속도" },
];

const TABS = ["현재 제안", "수정 완료", "제외됨"] as const;

// 콘텐츠 가시성 회복(ContentRecoveryClient)과 동일한 UI/로직을 재사용하되,
// 지표 이름(가독성/FAQ/목차/이미지 alt)에 관계없이 동작하는 범용 버전 —
// crawl-sitemap.mjs가 한 번의 재크롤로 모든 지표를 같이 계산해두므로 URL당
// 재크롤 한 번이면 5개 기회가 동시에 갱신된다.
export function ContentAuditClient({
  data,
  domain,
  backHref = "/opportunities",
  searchAppearance,
}: {
  data: ContentAuditOpportunity;
  /** 최초 크롤 때 저장된 것과 정확히 같은 domain 문자열이어야 한다 — URL에서
   *  새로 추출하면 www 유무 등으로 어긋나 "재크롤 결과가 다른 도메인으로
   *  잡혀서" 전/후 비교에 안 들어가는 문제가 생긴다. */
  domain: string;
  backHref?: string;
  /** FAQ/목차 기회에서만 넘어오는 구글 리치 결과 실적(searchAppearance 차원) —
   *  이 기회를 실행한 뒤 실제로 리치 결과 노출이 생겼는지 확인하는 근거.
   *  (docs/gsc-additional-signals.md §3-③) */
  searchAppearance?: GscSearchAppearanceRow[] | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("현재 제안");
  const [recheckJobs, setRecheckJobs] = useState<Record<string, { jobId: string; stage: string; done: boolean; error: string | null }>>({});
  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkJob, setBulkJob] = useState<{ jobId: string; done: boolean; error: string | null } | null>(null);
  const bulkPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [guideTarget, setGuideTarget] = useState<ContentAuditUrl | null>(null);
  const [viewingGuide, setViewingGuide] = useState<ContentAuditUrl | null>(null);

  useEffect(() => {
    return () => {
      Object.values(pollRefs.current).forEach(clearInterval);
      if (bulkPollRef.current) clearInterval(bulkPollRef.current);
    };
  }, []);

  const rowsByTab: Record<(typeof TABS)[number], ContentAuditUrl[]> = {
    "현재 제안": data.urls.filter((u) => u.status === "not_optimized"),
    "수정 완료": data.urls.filter((u) => u.status === "optimized"),
    제외됨: data.urls.filter((u) => u.status === "excluded"),
  };
  const rows = rowsByTab[tab];

  // 체크박스는 "현재 제안" 탭에서만 의미가 있다 — 재크롤 대상이 되는 것도
  // 아직 수정하지 않은 URL뿐이라서, 탭을 바꾸면 선택도 초기화한다.
  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  async function setExcluded(url: string, excluded: boolean) {
    await fetch("/api/content-audit-exclude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricKey: data.metricKey, url, excluded }),
    });
    router.refresh();
  }

  async function recheckUrl(url: string) {
    const res = await fetch("/api/sitemap-crawl/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, urls: [url] }),
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

  // 선택된 URL들을 한 번의 크롤 작업으로 묶어서 재색인한다 —
  // crawl-sitemap.mjs가 이미 --urls로 콤마 구분 다중 URL을 받으므로
  // URL 개수만큼 개별 작업을 띄울 필요가 없다.
  async function recheckMany(urls: string[]) {
    if (urls.length === 0) return;
    const res = await fetch("/api/sitemap-crawl/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, urls }),
    });
    const body = await res.json();
    if (!res.ok) {
      window.alert(body.error ?? "재크롤을 시작하지 못했습니다.");
      return;
    }
    setBulkJob({ jobId: body.jobId, done: false, error: null });
    setSelected(new Set());

    const poll = async () => {
      const statusRes = await fetch(`/api/sitemap-crawl/status?jobId=${body.jobId}`);
      if (!statusRes.ok) return;
      const statusBody = await statusRes.json();
      setBulkJob({ jobId: body.jobId, done: statusBody.done, error: statusBody.error });
      if (statusBody.done) {
        if (bulkPollRef.current) clearInterval(bulkPollRef.current);
        bulkPollRef.current = null;
        if (!statusBody.error) router.refresh();
      }
    };
    poll();
    bulkPollRef.current = setInterval(poll, 1500);
  }

  const selectableRows = rows.filter((r) => r.status === "not_optimized" && !(recheckJobs[r.url] && !recheckJobs[r.url].done));

  const selectColumn: DataTableColumn<ContentAuditUrl> = {
    key: "select",
    label:
      tab === "현재 제안" && selectableRows.length > 0 ? (
        <input
          type="checkbox"
          aria-label="전체 선택"
          checked={selectableRows.every((r) => selected.has(r.url))}
          ref={(el) => {
            if (el) el.indeterminate = selectableRows.some((r) => selected.has(r.url)) && !selectableRows.every((r) => selected.has(r.url));
          }}
          onChange={(e) => {
            setSelected((prev) => {
              const next = new Set(prev);
              selectableRows.forEach((r) => (e.target.checked ? next.add(r.url) : next.delete(r.url)));
              return next;
            });
          }}
          className="size-3.5 cursor-pointer accent-slate-800"
        />
      ) : null,
    width: "w-[32px]",
    render: (r) =>
      r.status !== "not_optimized" ? null : (
        <input
          type="checkbox"
          checked={selected.has(r.url)}
          onChange={(e) => {
            e.stopPropagation();
            setSelected((prev) => {
              const next = new Set(prev);
              if (e.target.checked) next.add(r.url);
              else next.delete(r.url);
              return next;
            });
          }}
          onClick={(e) => e.stopPropagation()}
          className="size-3.5 cursor-pointer accent-slate-800"
        />
      ),
  };

  const columns: DataTableColumn<ContentAuditUrl>[] = [
    selectColumn,
    {
      key: "url",
      label: "전체 도메인 URL",
      width: "w-[280px]",
      render: (r) => (
        <span title={r.url} className="block min-w-0 truncate text-blue-600">
          {r.url}
        </span>
      ),
    },
    {
      key: "score",
      label: data.metricLabel,
      width: "w-[160px]",
      render: (r) =>
        r.previousScore !== undefined ? (
          <span className="flex items-center gap-1 text-xs">
            <span className="text-neutral-400">
              {r.previousScore}
              {data.unit}
            </span>
            <span className="text-neutral-300">→</span>
            <span className="font-bold text-neutral-800">
              {r.score}
              {data.unit}
            </span>
          </span>
        ) : (
          `${r.score}${data.unit}`
        ),
    },
    { key: "priorityScore", label: "우선순위 점수", width: "w-[110px]", render: (r) => r.priorityScore.toFixed(1) },
    {
      key: "googleIndex",
      label: "구글 인덱싱",
      width: "w-[140px]",
      render: (r) => <GoogleIndexBadge url={r.url} status={r.googleIndex} />,
    },
    {
      key: "pageSpeed",
      label: "페이지 속도",
      width: "w-[120px]",
      render: (r) => <PageSpeedBadge url={r.url} result={r.pageSpeed} />,
    },
    {
      key: "action",
      label: "액션",
      width: "w-[330px]",
      render: (r) => {
        const job = recheckJobs[r.url];
        const guideButton = (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (r.guide) setViewingGuide(r);
              else setGuideTarget(r);
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold cursor-pointer ${
              r.guide ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
            }`}
          >
            <Sparkles size={12} />
            {r.guide ? "가이드 보기" : "가이드 등록"}
          </button>
        );
        if (r.status === "excluded") {
          return (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExcluded(r.url, false);
                }}
                className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
              >
                다시 포함
              </button>
            </div>
          );
        }
        if (r.status === "optimized") {
          return (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-emerald-600">기준 통과</span>
              {guideButton}
            </div>
          );
        }
        if (job && !job.done) {
          return (
            <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
              <Loader2 size={12} className="animate-spin" /> 재크롤 중...
            </span>
          );
        }
        return (
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                recheckUrl(r.url);
              }}
              className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
            >
              <RefreshCw size={12} />
              재색인
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExcluded(r.url, true);
              }}
              className="flex items-center gap-1 rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-500 cursor-pointer hover:bg-neutral-200"
            >
              <XCircle size={12} />
              제외
            </button>
            {guideButton}
          </div>
        );
      },
    },
  ];

  const cols = useColumnVisibility(columns, OPTIONAL_COLUMNS);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6 pb-10">
      <a href={backHref} className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        기회 목록으로 돌아가기
      </a>

      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold text-neutral-900">{data.title}</h1>
        <div className="flex gap-7">
          <StatPair value={data.affectedUrls} label="수정 필요 URL" />
          <StatPair value={`${data.averageScore}${data.unit}`} label={`평균 ${data.metricLabel}`} />
        </div>
      </div>

      <section className="rounded-xl bg-blue-50/60 px-6 py-5">
        <h2 className="text-[17px] font-bold text-neutral-900">개요</h2>
        <p className="mt-3 rounded-lg bg-white p-5 text-[13px] leading-relaxed text-neutral-700">{data.description}</p>
      </section>

      {data.comparison && (
        <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
          <h2 className="text-[17px] font-bold text-neutral-900">전/후 비교</h2>
          <p className="mt-1 text-xs text-neutral-500">같은 URL을 다시 크롤링해서 얻은 실측 비교입니다. 배포 없이 재크롤만 반복해서 측정합니다.</p>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-neutral-400">{new Date(data.comparison.baselineCrawledAt).toLocaleDateString("ko-KR")} (최초)</span>
              <span className="text-2xl font-bold text-neutral-500">
                {data.comparison.baselineAverageScore}
                {data.unit}
              </span>
            </div>
            <span className="text-xl text-neutral-300">→</span>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[11px] text-neutral-400">{new Date(data.comparison.latestCrawledAt).toLocaleDateString("ko-KR")} (최신)</span>
              <span className="text-2xl font-bold text-neutral-900">
                {data.comparison.latestAverageScore}
                {data.unit}
              </span>
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

      {searchAppearance && searchAppearance.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
          <h2 className="text-[17px] font-bold text-neutral-900">구글 검색 결과 노출 유형</h2>
          <p className="mt-1 text-xs text-neutral-500">
            최근 4주 Google Search Console 실측입니다. 이 기회를 실행해 리치 결과(FAQ, 사이트링크 등)로 노출되기 시작했는지
            확인하는 근거로 쓰세요.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {searchAppearance.map((row) => (
              <div key={row.appearance} className="rounded-lg bg-neutral-50 p-3">
                <p className="text-[11px] text-neutral-500">{row.appearance.replace(/_/g, " ")}</p>
                <p className="mt-1 text-lg font-bold text-neutral-900">{row.impressions.toLocaleString("ko-KR")}</p>
                <p className="text-[11px] text-neutral-400">노출 · 클릭 {row.clicks.toLocaleString("ko-KR")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-neutral-400" />
          <h2 className="text-[15px] font-bold text-neutral-700">LLM 기반 수정 가이드</h2>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          아직 LLM API가 연동되지 않아, 아래 표에서 URL별 "가이드 등록" 버튼으로 직접 LLM에게 물어본 답변을 등록할 수 있습니다. API가
          연동되면 이 버튼을 누르지 않아도 자동으로 채워집니다.
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
          콘텐츠를 수정한 뒤 "수정 완료 확인"을 누르면 그 URL만 다시 크롤링해서 실측으로 기준 통과 여부를 검토합니다.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 border-b border-neutral-200">
          <div className="flex gap-6">
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
          {tab === "현재 제안" && rowsByTab["현재 제안"].length > 0 && (
            <button
              type="button"
              disabled={!!(bulkJob && !bulkJob.done)}
              onClick={() => recheckMany(selected.size > 0 ? [...selected] : rowsByTab["현재 제안"].map((r) => r.url))}
              className="mb-2 flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer hover:bg-slate-700 disabled:cursor-default disabled:bg-neutral-300"
            >
              {bulkJob && !bulkJob.done ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> 재크롤 중...
                </>
              ) : selected.size > 0 ? (
                `선택 재색인 (${selected.size}) →`
              ) : (
                "전체 재색인 →"
              )}
            </button>
          )}
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

      {guideTarget && (
        <LlmBridgeModal
          open={guideTarget !== null}
          onClose={() => setGuideTarget(null)}
          title="LLM 기반 수정 가이드 등록"
          instructions="LLM API 연동 전까지, 이 URL을 어떻게 수정하면 좋을지 LLM에게 직접 물어본 뒤 답변을 붙여넣어 등록합니다."
          scope={`content-guide-${data.metricKey}`}
          itemKey={guideTarget.url}
          promptText={`다음 URL의 "${data.metricLabel}"이(가) 기준(${data.unit === "pt" ? "60pt 이상" : "50% 이상"})에 못 미칩니다: ${guideTarget.url}\n현재 점수: ${guideTarget.score}${data.unit}\n\n${data.description}\n\n이 페이지를 실제로 어떻게 수정하면 이 지표를 개선할 수 있을지, 구체적인 수정 가이드를 문단으로 작성해주세요.`}
          parse={(raw) => (raw.trim() ? { data: { guide: raw } } : { error: "내용을 입력해주세요." })}
          onSaved={() => router.refresh()}
        />
      )}

      {viewingGuide && (
        <Modal open={viewingGuide !== null} onClose={() => setViewingGuide(null)}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">LLM 기반 수정 가이드</h2>
            <ModalCloseButton onClose={() => setViewingGuide(null)} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">{viewingGuide.url}</p>
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 text-[13px] leading-relaxed text-neutral-700">
            {viewingGuide.guide}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const target = viewingGuide;
                setViewingGuide(null);
                setGuideTarget(target);
              }}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
            >
              다시 등록
            </button>
          </div>
        </Modal>
      )}
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
