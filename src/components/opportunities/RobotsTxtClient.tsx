"use client";

import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { BlockedAgentRow, GscSitemapStatus, RobotsTxtOpportunity } from "@/lib/db";

export function RobotsTxtClient({ data, sitemaps }: { data: RobotsTxtOpportunity; sitemaps?: GscSitemapStatus[] | null }) {
  const columns: DataTableColumn<BlockedAgentRow>[] = [
    { key: "agent", label: "에이전트", render: (r) => <span className="text-neutral-900">{r.agent}</span> },
    { key: "blockedUrls", label: "차단된 URL", width: "w-[140px]", render: (r) => <span className="text-red-700">{r.blockedUrls}</span> },
    { key: "rule", label: "규칙", width: "w-[300px]", render: (r) => <span className="text-red-700">{r.rule}</span> },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <a href="/opportunities" className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        기회 목록으로 돌아가기
      </a>

      <h1 className="text-[26px] font-bold text-neutral-900">{data.title}</h1>
      <p className="text-[13px] text-neutral-500">{data.description}</p>

      <div className="flex items-center justify-between gap-6 rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <p className="text-[13px] text-neutral-700">{data.summary}</p>
        <div className="flex gap-8">
          <StatPair value={data.totalUrls} label="전체 URL" />
          <StatPair value={data.blockedAgentsCount} label="차단된 에이전트" />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[15px] font-bold text-neutral-900">robots.txt</h2>
        <p className="mt-1 text-[13px] text-neutral-600">
          AI 에이전트와 봇이 사이트의 여러 URL에 접근하는 것을 막는 라인을 확인할 수 있습니다. 차단 지시어(빨간색)는 영향과 제안된 수정 방법을 나타냅니다.
        </p>
        <div className="mt-3 overflow-x-auto rounded-md bg-neutral-50 py-3 font-mono text-xs">
          {data.lines.map((line) => (
            <div key={line.lineNumber} className={`flex gap-4 px-2 py-0.5 ${line.blocksAgent ? "bg-red-50" : ""}`}>
              <span className="w-6 shrink-0 text-right text-neutral-400">{line.lineNumber}</span>
              <span className={line.blocksAgent ? "font-bold text-red-700" : "text-neutral-800"}>{line.text || " "}</span>
            </div>
          ))}
        </div>
      </div>

      {sitemaps && sitemaps.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
          <h2 className="text-[15px] font-bold text-neutral-900">사이트맵 상태 (Google Search Console)</h2>
          <p className="mt-1 text-xs text-neutral-500">제출한 사이트맵별로 구글이 실제로 처리한 현황입니다.</p>
          <div className="mt-3 flex flex-col gap-3">
            {sitemaps.map((s) => (
              <div key={s.path} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[13px] font-medium text-blue-700">{s.path}</span>
                  {s.errors > 0 ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                      <AlertTriangle size={12} /> 에러 {s.errors}건
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 size={12} /> 정상
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-neutral-400">
                  마지막 다운로드: {s.lastDownloaded ? new Date(s.lastDownloaded).toLocaleString("ko-KR") : "—"}
                  {s.warnings > 0 && ` · 경고 ${s.warnings}건`}
                </p>
                {s.contents.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-4">
                    {s.contents.map((c) => (
                      <span key={c.type} className="text-[11px] text-neutral-600">
                        {c.type}: 제출 {c.submitted.toLocaleString("ko-KR")} · 인덱싱 {c.indexed.toLocaleString("ko-KR")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white px-6 py-5">
        <h2 className="text-[15px] font-bold text-neutral-900">에이전트별 차단된 트래픽 상세</h2>
        <p className="mt-1 text-xs text-neutral-500">
          어떤 AI 에이전트가 사이트 접근을 차단당했는지, 그리고 그에 영향을 미치는 구체적인 규칙을 확인하세요.
        </p>
        <div className="mt-3">
          <DataTable columns={columns} rows={data.blockedTraffic} getRowId={(r) => r.agent} />
        </div>
      </div>
    </div>
  );
}

function StatPair({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xl font-bold text-neutral-900">{value}</span>
      <span className="text-[11px] text-neutral-500">{label}</span>
    </div>
  );
}
