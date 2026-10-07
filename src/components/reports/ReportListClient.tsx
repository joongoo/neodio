"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { MARKET_FILTER_OPTIONS, MODEL_FILTER_OPTIONS, QUERY_SCOPE_OPTIONS } from "@/lib/filterOptionLabels";
import { RANGE_LABEL, type ReportRange } from "@/lib/report";
import type { ReportSummary } from "@/lib/backend/reportStore";

const RANGES = Object.keys(RANGE_LABEL) as ReportRange[];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
};

export function ReportListClient({ reports }: { reports: ReportSummary[] }) {
  const router = useRouter();
  const base = usePathname().replace(/\/$/, "");
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<ReportRange>("4w");
  const [market, setMarket] = useState("전체");
  const [model, setModel] = useState("전체");
  const [scope, setScope] = useState("전체");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, range, market, model, scope }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "보고서를 만들지 못했어요.");
        return;
      }
      router.push(`${base}/${body.report.id}`);
    } catch {
      setError("보고서를 만들지 못했어요. 네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">리포트</h1>
        <p className="mt-1 text-sm text-neutral-500">
          만드는 시점의 지표를 그대로 저장해서 클라이언트에게 보낼 보고서를 만들어요. 저장된 보고서는 이후 데이터가 바뀌어도 달라지지 않아요.
        </p>
      </div>

      <EditOnly>
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-neutral-800">새 보고서 만들기</p>
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-title" className="text-xs font-medium text-neutral-500">제목 (비우면 자동)</label>
              <input id="report-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="h-10 w-[280px] rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-slate-500" />
            </div>
            <Dropdown variant="solid" label="기간" value={RANGE_LABEL[range]} options={RANGES.map((r) => RANGE_LABEL[r])} onChange={(v) => setRange(RANGES.find((r) => RANGE_LABEL[r] === v) ?? "4w")} />
            <Dropdown variant="solid" label="마켓" value={market} options={MARKET_FILTER_OPTIONS} onChange={setMarket} />
            <Dropdown variant="solid" label="모델" value={model} options={MODEL_FILTER_OPTIONS} onChange={setModel} />
            <Dropdown variant="solid" label="질의" value={scope} options={QUERY_SCOPE_OPTIONS} onChange={setScope} />
            <button type="button" onClick={create} disabled={busy} className="flex h-10 items-center gap-1.5 rounded-md bg-slate-800 px-4 text-sm font-bold text-white cursor-pointer hover:opacity-90 disabled:cursor-default disabled:opacity-60">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? "만드는 중..." : "보고서 만들기"}
            </button>
          </div>
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </Card>
      </EditOnly>

      <Card className="p-0">
        {reports.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutral-500">아직 만든 보고서가 없어요.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`${base}/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-50">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-neutral-900">{r.title}</span>
                    <span className="text-xs text-neutral-500">{RANGE_LABEL[r.range]} · {formatDate(r.createdAt)} 생성</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === "final" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                    {r.status === "final" ? "확정" : "작성 중"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
