"use client";

import { useState } from "react";
import { ArrowLeft, FileCheck2, Send, Settings2, BarChart3, Settings } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { ContentRecoveryOpportunity, ContentRecoveryUrl } from "@/lib/db";

const OPTIONAL_COLUMNS: ColumnOption[] = [
  { key: "contentVisibility", label: "가시성 %" },
  { key: "priorityScore", label: "우선순위 점수" },
];

const STEPS = [
  { icon: FileCheck2, title: "페이지 선택", desc: "가시성 낮은 URL 필터를 사용하세요" },
  { icon: Send, title: "몇 분 안에 최적화", desc: "AI 에이전트만 최적화된 경험을 보게 됩니다" },
  { icon: Settings2, title: "임팩트 측정", desc: "성과를 자동으로 측정해 드립니다" },
  { icon: BarChart3, title: "결과 확인", desc: "약 2주 후 기회 워크스페이스에서 확인하세요" },
];

const TABS = ["현재 제안", "수정 완료", "무시됨"] as const;

export function ContentRecoveryClient({ data }: { data: ContentRecoveryOpportunity }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("현재 제안");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rowsByTab: Record<(typeof TABS)[number], ContentRecoveryUrl[]> = {
    "현재 제안": data.urls,
    "수정 완료": [],
    무시됨: [],
  };
  const rows = rowsByTab[tab];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: DataTableColumn<ContentRecoveryUrl>[] = [
    {
      key: "select",
      label: "",
      width: "w-[24px]",
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggle(r.id)}
          className="size-4 cursor-pointer accent-slate-800"
        />
      ),
    },
    { key: "url", label: "전체 도메인 URL", render: (r) => <span className="text-blue-600">{r.url}</span> },
    { key: "contentVisibility", label: "가시성 %", width: "w-[100px]", render: (r) => `${r.contentVisibility}%` },
    { key: "priorityScore", label: "우선순위 점수", width: "w-[110px]", render: (r) => r.priorityScore.toFixed(1) },
    {
      key: "action",
      label: "액션",
      width: "w-[160px]",
      render: () => (
        <div className="flex gap-2">
          <button className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200">
            미리보기
          </button>
          <button className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-200">
            상세
          </button>
        </div>
      ),
    },
  ];

  const cols = useColumnVisibility(columns, OPTIONAL_COLUMNS);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6 pb-24">
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

      <section className="rounded-xl bg-blue-50/60 px-6 py-5">
        <h2 className="text-[17px] font-bold text-neutral-900">가이드</h2>
        <p className="mt-3 rounded-lg bg-blue-100/60 p-3 text-xs text-blue-900">
          완전한 효과를 보려면 우선순위 필터에서 20개 이상의 페이지를 포함하세요. 선택된 모든 페이지가 최적화되며, 적격 배포는 임팩트 분석을 받습니다.
        </p>
        <div className="mt-5 flex items-start justify-center gap-4">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex items-start gap-4">
              <div className="flex w-[170px] flex-col items-center gap-2 text-center">
                <div className="grid size-10 place-items-center rounded-full bg-emerald-100">
                  <step.icon size={18} className="text-emerald-700" />
                </div>
                <p className="text-[13px] font-bold text-neutral-900">{step.title}</p>
                <p className="text-[11px] text-neutral-500">{step.desc}</p>
              </div>
              {i < STEPS.length - 1 && <div className="mt-5 h-px w-[60px] shrink-0 bg-neutral-300" />}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-blue-50/60 px-6 py-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-neutral-600">
            위에서 제안된 대로 Optimize on Edge 솔루션을 사용해 콘텐츠를 안전하게 최적화해 보세요.
          </p>
          <div className="flex flex-col items-end gap-1">
            <button className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-white cursor-pointer hover:opacity-90">
              최적화 배포
            </button>
            <span className="text-[11px] text-neutral-400">배포할 제안을 선택하세요</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <p className="text-[11px] font-bold text-neutral-500">최적화 진행률</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 w-[300px] rounded bg-neutral-200">
            <div
              className="h-2 rounded bg-emerald-600"
              style={{ width: `${(data.optimizedCount / data.totalCount) * 100}%` }}
            />
          </div>
          <span className="text-xs text-neutral-700">
            {data.totalCount}개 URL 중 {data.optimizedCount}개 최적화됨
          </span>
        </div>
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
        <p className="mt-3 rounded-lg bg-blue-100/60 p-3 text-xs text-blue-900">
          임팩트 분석을 원하시면 각 배포에 우선순위가 높은 URL 20개 이상을 포함하세요. AI 에이전트가 자주 방문하지만 읽기 어려워하는 페이지들이 가장 강력한 최적화 후보입니다.
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

      <div className="fixed bottom-0 left-[260px] right-0 flex items-center justify-end gap-4 border-t border-neutral-200 bg-white px-8 py-3.5">
        <span className="text-[13px] text-neutral-500">배포할 제안을 선택하세요</span>
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 cursor-pointer hover:bg-slate-200" disabled={selected.size === 0}>
          수정 완료로 표시
        </button>
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800 cursor-pointer hover:bg-slate-200" disabled={selected.size === 0}>
          제안 무시
        </button>
        <button className="rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-white cursor-pointer hover:opacity-90" disabled={selected.size === 0}>
          최적화 배포
        </button>
      </div>
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
