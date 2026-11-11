"use client";

import { useEffect, useState } from "react";

type Plan = {
  query: string;
  locationName: string;
  languageCode: string;
  device: string;
  taskCount: number;
  estimatedMaxCostUsd: number;
  stageBudgetUsd: number;
  surfaces: { surface: string; estimatedMaxCostUsd: number }[];
};

type Run = {
  runId: string;
  status: "submitting" | "queued" | "running" | "succeeded" | "failed";
  actualCostUsd: number;
  error?: string;
  tasks: { surface: string; providerTaskId: string; status: string; costUsd: number }[];
  results?: { surface: string; aiAnswerStatus: string; answer: string | null; citations: { url: string }[] }[];
};

export function DataForSeoPocClient({ plan, enabled, credentialsReady, accessTokenReady }: { plan: Plan; enabled: boolean; credentialsReady: boolean; accessTokenReady: boolean }) {
  const [query, setQuery] = useState(plan.query);
  const [accessToken, setAccessToken] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = run?.status === "submitting" || run?.status === "queued" || run?.status === "running";

  useEffect(() => {
    if (!run || !busy) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/dataforseo-poc/status?runId=${encodeURIComponent(run.runId)}`, { cache: "no-store", headers: { "x-neodio-stage-a-token": accessToken } });
      const data = (await response.json().catch(() => ({}))) as { run?: Run; error?: string };
      if (data.run) setRun(data.run);
      if (!response.ok) setError(data.error ?? `상태 조회 오류 ${response.status}`);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [run, busy, accessToken]);

  async function submit() {
    setError(null);
    const response = await fetch("/api/dataforseo-poc/start", {
      method: "POST",
      headers: { "content-type": "application/json", "x-neodio-stage-a-token": accessToken },
      body: JSON.stringify({
        query,
        confirmation: "SUBMIT_STAGE_A_2_TASKS",
        confirmedMaxCostUsd: plan.estimatedMaxCostUsd,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { run?: Run; error?: string };
    if (data.run) setRun(data.run);
    if (!response.ok) setError(data.error ?? `제출 오류 ${response.status}`);
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-6 lg:p-10">
      <h1 className="text-2xl font-bold text-neutral-900">DataForSEO Stage A PoC</h1>
      <p className="mt-2 text-sm text-neutral-600">기존 Collector와 분리된 수동 검증 화면입니다. 실행 확인 전에는 Provider 요청을 보내지 않습니다.</p>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="font-semibold text-neutral-900">실행 계획</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-neutral-500">조건</dt><dd>{plan.languageCode} · {plan.locationName} · {plan.device}</dd></div>
          <div><dt className="text-neutral-500">요청</dt><dd>Standard Task {plan.taskCount}건</dd></div>
          <div><dt className="text-neutral-500">최대 예상 비용</dt><dd>USD {plan.estimatedMaxCostUsd.toFixed(4)}</dd></div>
          <div><dt className="text-neutral-500">Stage A 한도</dt><dd>USD {plan.stageBudgetUsd.toFixed(2)}</dd></div>
        </dl>
        <ul className="mt-4 space-y-1 text-sm text-neutral-600">
          {plan.surfaces.map((item) => <li key={item.surface}>{item.surface}: 1건 · 최대 USD {item.estimatedMaxCostUsd.toFixed(4)}</li>)}
        </ul>
        <label className="mt-5 block text-sm font-medium text-neutral-800" htmlFor="stage-a-query">테스트 질의</label>
        <textarea id="stage-a-query" value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} maxLength={700} className="mt-2 min-h-24 w-full rounded-lg border border-neutral-300 p-3 text-sm" />
        <label className="mt-4 block text-sm font-medium text-neutral-800" htmlFor="stage-a-token">Stage A 실행 토큰</label>
        <input id="stage-a-token" type="password" autoComplete="off" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} disabled={busy} className="mt-2 w-full rounded-lg border border-neutral-300 p-3 text-sm" />

        {!enabled || !credentialsReady || !accessTokenReady ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {!enabled ? "DATAFORSEO_STAGE_A_ENABLED=true 설정이 필요합니다. " : ""}
            {!credentialsReady ? "DATAFORSEO_LOGIN·DATAFORSEO_PASSWORD 설정이 필요합니다." : ""}
            {!accessTokenReady ? " DATAFORSEO_STAGE_A_TOKEN 설정이 필요합니다." : ""}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {!reviewing ? (
            <button type="button" onClick={() => setReviewing(true)} disabled={!enabled || !credentialsReady || !accessTokenReady || busy || !query.trim() || !accessToken} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">요청 내용 검토</button>
          ) : (
            <>
              <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">확인 후 2건 제출</button>
              <button type="button" onClick={() => setReviewing(false)} disabled={busy} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm">취소</button>
            </>
          )}
        </div>
        {reviewing && !busy && <p className="mt-3 text-xs text-neutral-500">다음 버튼을 눌러야 Google AIO 1건과 AI Mode 1건이 실제 제출됩니다.</p>}
      </section>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {run && (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4"><h2 className="font-semibold">실행 결과</h2><span className="text-sm text-neutral-600">{run.status}</span></div>
          <p className="mt-2 break-all text-xs text-neutral-500">{run.runId}</p>
          <p className="mt-2 text-sm">실제 제출 비용: USD {run.actualCostUsd.toFixed(4)}</p>
          <ul className="mt-4 space-y-3">
            {run.tasks.map((task) => <li key={task.surface} className="rounded-lg border border-neutral-200 p-3 text-sm"><strong>{task.surface}</strong><div className="mt-1 text-neutral-600">{task.status} · USD {task.costUsd.toFixed(4)} · {task.providerTaskId}</div></li>)}
          </ul>
          {run.results?.map((result) => (
            <article key={result.surface} className="mt-4 rounded-lg bg-neutral-50 p-4 text-sm">
              <h3 className="font-semibold">{result.surface} · AI 답변 {result.aiAnswerStatus}</h3>
              <p className="mt-2 whitespace-pre-wrap text-neutral-700">{result.answer ?? "AI 답변 본문 없음"}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-600">{result.citations.map((citation) => <li key={citation.url} className="break-all">{citation.url}</li>)}</ul>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
