"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Printer, Lock, Trash2, Save } from "lucide-react";
import { EditOnly } from "@/components/auth/PermissionsProvider";
import { RateBars, TrendChart } from "@/components/reports/ReportCharts";
import { REPORT_SECTIONS, RANGE_LABEL, type ReportKpi, type ReportSectionKey, type ReportSections } from "@/lib/report";
import type { Report } from "@/lib/backend/reportStore";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long" });
};

function KpiBox({ label, kpi, hint }: { label: string; kpi: ReportKpi; hint: string }) {
  const arrow = kpi.trend.direction === "up" ? "▲" : kpi.trend.direction === "down" ? "▼" : "–";
  const color = kpi.trend.direction === "up" ? "text-emerald-600" : kpi.trend.direction === "down" ? "text-red-600" : "text-neutral-500";
  return (
    <div className="rounded-lg border border-neutral-200 p-4 break-inside-avoid">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-neutral-900">{kpi.value.toFixed(kpi.decimals ?? 1)}{kpi.suffix ?? ""}</p>
      <p className={`mt-1 text-xs font-medium ${color}`}>{arrow} {kpi.trend.direction === "flat" ? "변화 없음" : `${kpi.trend.percent}${kpi.trendUnit}`} <span className="font-normal text-neutral-400">직전 기간 대비</span></p>
      <p className="mt-2 text-[11px] leading-snug text-neutral-400">{hint}</p>
    </div>
  );
}

function Heading({ n, children }: { n: number; children: React.ReactNode }) {
  return <h2 className="mb-3 border-b border-neutral-200 pb-2 text-lg font-semibold text-neutral-900">{n}. {children}</h2>;
}

const THead = ({ cols }: { cols: string[] }) => (
  <thead><tr className="border-b border-neutral-200 text-left text-neutral-500">{cols.map((c) => <th key={c} className="py-1.5 pr-3 font-medium">{c}</th>)}</tr></thead>
);

export function ReportView({ report }: { report: Report }) {
  const router = useRouter();
  const listPath = usePathname().replace(/\/[^/]+\/?$/, "");
  const { snapshot: s } = report;
  const locked = report.status === "final";
  const [title, setTitle] = useState(report.title);
  const [sections, setSections] = useState<ReportSections>(report.sections);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchSection = (key: ReportSectionKey, part: Partial<ReportSections[ReportSectionKey]>) => {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...part } }));
    setDirty(true);
  };

  async function call(init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}`, { ...init, headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "처리하지 못했어요.");
        return false;
      }
      return true;
    } catch {
      setError("처리하지 못했어요. 네트워크를 확인해 주세요.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = async () => {
    if (await call({ method: "PATCH", body: JSON.stringify({ title, sections }) })) setDirty(false);
  };
  const finalize = async () => {
    if (!confirm("확정하면 더 이상 수정할 수 없어요. 확정할까요?")) return;
    if (dirty && !(await call({ method: "PATCH", body: JSON.stringify({ title, sections }) }))) return;
    if (await call({ method: "PATCH", body: JSON.stringify({ status: "final" }) })) router.refresh();
  };
  const remove = async () => {
    if (!confirm("이 보고서를 삭제할까요? 되돌릴 수 없어요.")) return;
    if (await call({ method: "DELETE" })) router.push(listPath);
  };

  const commentary = (key: ReportSectionKey) => {
    const text = sections[key].commentary;
    return (
      <div className="mt-4">
        {!locked && (
          <textarea
            value={text}
            onChange={(e) => patchSection(key, { commentary: e.target.value })}
            rows={Math.max(3, text.split("\n").length + 1)}
            placeholder="이 섹션에 대한 담당자 코멘트를 적어주세요."
            className="w-full rounded-md border border-neutral-300 p-3 text-sm outline-none focus:border-slate-500 print:hidden"
          />
        )}
        {text.trim() && <p className={`whitespace-pre-line text-sm leading-relaxed text-neutral-800 ${locked ? "" : "hidden print:block"}`}>{text}</p>}
      </div>
    );
  };

  const visible = REPORT_SECTIONS.filter((sec) => sections[sec.key].included);
  const number = (key: ReportSectionKey) => visible.findIndex((sec) => sec.key === key) + 1;
  const on = (key: ReportSectionKey) => sections[key].included;

  const weekly = (kpi: ReportKpi) => kpi.sparkline.map((p) => ({ label: p.week, value: p.value }));
  const m = s.appendix.measurement;

  return (
    <div className="mx-auto max-w-[820px] p-6 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {locked ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><Lock size={11} /> 확정됨 {report.finalizedAt ? fmtDate(report.finalizedAt) : ""}</span> : <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600">작성 중</span>}
          {dirty && <span className="text-amber-600">저장하지 않은 변경이 있어요</span>}
        </div>
        <div className="flex items-center gap-2">
          <EditOnly>
            {!locked && (
              <>
                <button type="button" onClick={save} disabled={busy || !dirty} className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer hover:bg-slate-200 disabled:cursor-default disabled:opacity-50"><Save size={12} />저장</button>
                <button type="button" onClick={finalize} disabled={busy} className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 cursor-pointer hover:bg-slate-200 disabled:opacity-50"><Lock size={12} />확정</button>
              </>
            )}
            <button type="button" onClick={remove} disabled={busy} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-red-600 cursor-pointer hover:bg-red-50 disabled:opacity-50"><Trash2 size={12} />삭제</button>
          </EditOnly>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-bold text-white cursor-pointer hover:opacity-90"><Printer size={12} />PDF로 저장</button>
        </div>
      </div>
      {error && <p className="mb-3 text-xs font-medium text-red-600 print:hidden">{error}</p>}

      {!locked && (
        <div className="mb-5 rounded-lg border border-neutral-200 bg-white p-4 print:hidden">
          <p className="mb-2 text-xs font-semibold text-neutral-700">포함할 섹션</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REPORT_SECTIONS.map((sec) => (
              <label key={sec.key} className="flex items-start gap-2 text-xs text-neutral-700">
                <input type="checkbox" className="mt-0.5" checked={sections[sec.key].included} onChange={(e) => patchSection(sec.key, { included: e.target.checked })} />
                <span><span className="font-medium">{sec.title}</span> <span className="text-neutral-400">— {sec.description}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      <article className="flex flex-col gap-8 rounded-lg bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-slate-800 pb-4">
          {locked ? <h1 className="text-2xl font-bold text-neutral-900">{title}</h1> : (
            <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} maxLength={100} aria-label="보고서 제목" className="w-full bg-transparent text-2xl font-bold text-neutral-900 outline-none print:hidden" />
          )}
          {!locked && <h1 className="hidden text-2xl font-bold text-neutral-900 print:block">{title}</h1>}
          <p className="mt-2 text-xs text-neutral-500">
            {s.brand.name}{s.brand.domain ? ` (${s.brand.domain})` : ""} · {RANGE_LABEL[report.range]} · 마켓 {s.filters.market} · 모델 {s.filters.model} · 질의 {s.filters.scope} · {fmtDate(s.generatedAt)} 기준
          </p>
        </header>

        {on("summary") && s.kpis && (
          <section>
            <Heading n={number("summary")}>요약</Heading>
            <div className="grid grid-cols-3 gap-3">
              <KpiBox label="가시성 점수" kpi={s.kpis.score} hint="언급·인용·노출 위치를 합친 종합 점수(100점 만점)" />
              <KpiBox label="브랜드 언급률" kpi={s.kpis.mention} hint="AI 답변 중 브랜드가 언급된 비율" />
              <KpiBox label="도메인 인용률" kpi={s.kpis.citation} hint="AI 답변 중 우리 도메인이 출처로 인용된 비율" />
            </div>
            {commentary("summary")}
          </section>
        )}

        {on("trend") && s.kpis && (
          <section className="break-inside-avoid">
            <Heading n={number("trend")}>추이</Heading>
            <TrendChart series={[
              { name: "가시성 점수", color: "#1e293b", points: weekly(s.kpis.score) },
              { name: "언급률(%)", color: "#2563eb", points: weekly(s.kpis.mention) },
              { name: "인용률(%)", color: "#f59e0b", points: weekly(s.kpis.citation) },
            ]} />
            {commentary("trend")}
          </section>
        )}

        {on("engines") && (
          <section className="break-inside-avoid">
            <Heading n={number("engines")}>엔진별 현황</Heading>
            <RateBars rows={s.engines.map((e) => ({ label: e.label, value: e.visibility }))} />
            {s.placement.length > 0 && (
              <table className="mt-5 w-full text-xs">
                <THead cols={["엔진", "분석 답변", "언급", "경쟁사와 비교 시 1등", "앞부분 노출", "상위 3위 인용"]} />
                <tbody>
                  {s.placement.map((p) => (
                    <tr key={p.label} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-3 font-medium text-neutral-800">{p.label}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.answers}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.mentioned}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.firstShare == null ? "–" : `${p.firstShare}%`}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.earlyShare == null ? "–" : `${p.earlyShare}%`}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.top3CitationShare == null ? "–" : `${p.top3CitationShare}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {commentary("engines")}
          </section>
        )}

        {on("competitors") && (
          <section className="break-inside-avoid">
            <Heading n={number("competitors")}>경쟁사 비교</Heading>
            {s.competitors.length > 0 ? (
              <>
                <p className="mb-2 text-xs text-neutral-500">비교 대상(등록한 경쟁사) 언급률</p>
                <RateBars rows={s.competitors.map((c) => ({ label: c.brand, value: c.mentionRate, highlight: c.isSelf }))} />
              </>
            ) : <p className="text-xs text-neutral-400">등록된 비교 대상이 없어요.</p>}
            {s.topBrands.length > 0 && (
              <>
                <p className="mb-2 mt-5 text-xs text-neutral-500">AI 답변에 가장 많이 언급된 브랜드</p>
                <RateBars rows={s.topBrands.map((b) => ({ label: b.brand, value: b.totalAnswers > 0 ? Math.round((b.mentions / b.totalAnswers) * 100) : 0, highlight: b.isOwn, note: `${b.mentions}/${b.totalAnswers}` }))} />
              </>
            )}
            {commentary("competitors")}
          </section>
        )}

        {on("topics") && (
          <section>
            <Heading n={number("topics")}>잘되는 점 · 놓치는 점</Heading>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="mb-2 text-xs font-semibold text-emerald-700">가시성이 높은 토픽</p>
                <RateBars rows={s.topics.strong.map((t) => ({ label: t.topic, value: t.visibility }))} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-red-700">언급이 없는 토픽</p>
                {s.topics.gaps.length ? (
                  <ul className="flex flex-col gap-1.5 text-xs text-neutral-700">{s.topics.gaps.map((t) => <li key={t.topic}>• {t.topic} <span className="text-neutral-400">({t.runs}회 수집)</span></li>)}</ul>
                ) : <p className="text-xs text-neutral-400">없어요.</p>}
              </div>
            </div>
            {commentary("topics")}
          </section>
        )}

        {on("sources") && (
          <section className="break-inside-avoid">
            <Heading n={number("sources")}>출처 · 인용</Heading>
            {s.sources.length > 0 ? (
              <table className="w-full text-xs">
                <THead cols={["출처 도메인", "인용된 프롬프트", "우리 언급", "함께 언급된 경쟁사"]} />
                <tbody>
                  {s.sources.map((src) => (
                    <tr key={src.domain} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-3 font-medium text-neutral-800">{src.domain}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{src.prompts}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{src.myBrandMentions}</td>
                      <td className="py-1.5 pr-3 text-neutral-600">{src.coMentioned || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-xs text-neutral-400">집계된 인용 소스가 없어요.</p>}
            {commentary("sources")}
          </section>
        )}

        {on("actions") && (
          <section className="break-inside-avoid">
            <Heading n={number("actions")}>실행 제안</Heading>
            {commentary("actions")}
          </section>
        )}

        {on("appendix") && (
          <section className="flex flex-col gap-6 text-xs text-neutral-700" style={{ breakBefore: "page" }}>
            <Heading n={number("appendix")}>부록 — 측정 방법과 데이터 품질</Heading>

            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">측정 개요</h3>
              <p className="leading-relaxed">
                {s.period.label} 동안 {m.engines.join(", ") || "선택한 엔진"}에서 {m.markets.join(", ") || "선택한 마켓"} 기준으로 수집한 AI 답변 {m.runs.toLocaleString()}건({"같은 주에 반복 수집된 같은 질문은 하나로 합쳐"} 관측 {m.observations.toLocaleString()}건)을 분석했어요.
                질의는 브랜드 직접 질의 {s.appendix.composition.brandQueryRuns.toLocaleString()}건, 일반(카테고리) 질의 {s.appendix.composition.generalQueryRuns.toLocaleString()}건으로 구성돼요.
              </p>
              {s.appendix.composition.categories.length > 0 && (
                <p className="mt-1.5 text-neutral-500">주요 카테고리: {s.appendix.composition.categories.slice(0, 8).map((c) => `${c.name}(${c.runs})`).join(", ")}</p>
              )}
            </div>

            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">지표 정의</h3>
              <ul className="flex flex-col gap-1 leading-relaxed">
                <li><b>브랜드 언급률</b> — 수집한 AI 답변 중 브랜드 이름이 나온 답변의 비율이에요.</li>
                <li><b>도메인 인용률</b> — AI가 출처로 보여준 링크 중 우리 도메인이 포함된 답변의 비율이에요.</li>
                <li><b>가시성 점수</b> — 언급(45%) · 인용(20%) · 언급 위치(35%)를 합쳐 100점 만점으로 환산한 종합 점수예요. 감정(긍/부정)은 점수에 포함하지 않아요.</li>
                <li><b>직전 기간 대비</b> — 점수는 상대 변화율(%), 언급률·인용률은 %p 차이예요.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">수집 품질</h3>
              {s.appendix.quality.length > 0 ? (
                <table className="w-full">
                  <THead cols={["엔진", "시도", "답변 생성", "답변 없음", "수집 실패"]} />
                  <tbody>
                    {s.appendix.quality.map((q) => (
                      <tr key={q.model} className="border-b border-neutral-100">
                        <td className="py-1 pr-3 font-medium">{q.model}</td>
                        <td className="py-1 pr-3 tabular-nums">{q.attempted}</td>
                        <td className="py-1 pr-3 tabular-nums">{q.answered}</td>
                        <td className="py-1 pr-3 tabular-nums">{q.absent}</td>
                        <td className="py-1 pr-3 tabular-nums">{q.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-neutral-400">집계된 수집 이력이 없어요.</p>}
              <p className="mt-1.5 text-neutral-500">지표는 AI가 답을 만든 실행만 분모로 삼아요. 답이 없거나 수집에 실패한 실행은 지표에서 빠져요.</p>
              {s.appendix.consistency && (
                <p className="mt-1.5">
                  같은 질문을 2번 이상 수집한 조합은 {s.appendix.consistency.repeatedPairs}개 중 매번 언급 {s.appendix.consistency.always}개, 가끔 언급 {s.appendix.consistency.sometimes}개, 한 번도 안 나옴 {s.appendix.consistency.never}개예요.
                  한 번만 수집된 조합({s.appendix.consistency.singleRunPairs}개)은 결과가 우연일 수 있어요.
                </p>
              )}
            </div>

            {s.appendix.registeredCompetitors.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">비교 대상</h3>
                <p>{s.appendix.registeredCompetitors.join(", ")}</p>
              </div>
            )}

            {(s.appendix.changes.length > 0 || s.appendix.versions.length > 0) && (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">측정 설정 변경 이력</h3>
                <p className="mb-1.5 text-neutral-500">프롬프트·경쟁사 등 설정이 바뀌면 지표가 달라질 수 있어서 기간 중 변경을 함께 적어요.</p>
                <ul className="flex flex-col gap-0.5">
                  {s.appendix.changes.slice(0, 10).map((c, i) => <li key={i}>• {fmtDate(c.at)} — {c.summary}</li>)}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">해석 가이드</h3>
              <ul className="flex flex-col gap-1 leading-relaxed">
                <li>AI 답변은 같은 질문에도 매번 조금씩 달라요. 한두 주의 작은 등락보다 몇 주에 걸친 방향을 보세요.</li>
                <li>관측 수가 적은 엔진·토픽의 비율은 흔들림이 커요. 표본이 충분한 항목을 우선 판단하세요.</li>
                <li>점수는 설정한 질문 묶음 안에서의 상대적인 위치예요. 질문을 추가·삭제하면 점수 기준이 달라질 수 있어요.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-neutral-900">용어</h3>
              <ul className="flex flex-col gap-1 leading-relaxed">
                <li><b>관측</b> — 질문 하나를 엔진 하나에 물어 얻은 답변 1건(같은 주 반복은 1건으로 합쳐요).</li>
                <li><b>인용</b> — AI가 답변의 근거로 보여주는 출처 링크.</li>
                <li><b>일반 질의 / 브랜드 질의</b> — 브랜드 이름 없이 카테고리를 묻는 질문 / 브랜드 이름이 들어간 질문.</li>
                <li><b>%p</b> — 비율끼리의 차이(퍼센트 포인트).</li>
              </ul>
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
