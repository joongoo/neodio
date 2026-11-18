"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createRequestDetailPoller, hasActiveRequestTasks, type RequestDetailSnapshot } from "@/lib/requestDetailProgress";
import { RequestSummary } from "./RequestLogViews";
import { RequestRunList } from "./RequestRunList";

export function RequestProgressStages({ request }: Pick<RequestDetailSnapshot, "request">) {
  const c = request.counts, p = request.phases;
  const cards = [["수집 대기", c.waiting], ["제출 중", p?.submitting ?? 0], ["수집·회수 중", p?.collecting ?? c.running],
    ["결과 반영 중", p?.processing ?? 0], ["완료", c.completed], ["실패", c.failed], ["제출 확인 필요", c.attention], ["취소", c.cancelled]] as const;
  return <section aria-label="수집 단계별 현황" className="rounded-xl border border-neutral-200 bg-white p-5">
    <h2 className="text-sm font-semibold text-neutral-900">수집 진행 현황</h2>
    <p className="mt-1 text-xs text-neutral-500">항목마다 독립적으로 처리됩니다. 전체 완료를 기다리지 않고 완료된 결과를 확인할 수 있습니다.</p>
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(([label, count]) => <div key={label} className="rounded-lg bg-neutral-50 px-3 py-2"><dt className="text-xs text-neutral-500">{label}</dt><dd className={`mt-1 text-xl font-semibold tabular-nums ${label === "실패" ? "text-red-700" : label === "제출 확인 필요" ? "text-orange-700" : "text-neutral-900"}`}>{count}</dd></div>)}</dl>
  </section>;
}

class ProgressReadError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export function RequestDetailLive({ initial, query, listProps, children }: {
  initial: RequestDetailSnapshot; query: string;
  listProps: Omit<ComponentProps<typeof RequestRunList>, "items" | "total">; children: ReactNode;
}) {
  const key = `${initial.request.id}?${query}`;
  const [live, setLive] = useState<{ key: string; baseline: RequestDetailSnapshot; snapshot: RequestDetailSnapshot } | null>(null);
  const [error, setError] = useState<{ key: string; baseline: RequestDetailSnapshot; message: string; stopped: boolean } | null>(null);
  const snapshot = live?.key === key && live.baseline === initial ? live.snapshot : initial;
  const active = hasActiveRequestTasks(snapshot.request);
  const currentError = error?.key === key && error.baseline === initial ? error : null;
  // Restart only for a new server snapshot/query, not for each polling response.
  useEffect(() => {
    const poller = createRequestDetailPoller<RequestDetailSnapshot>({
      initiallyActive: hasActiveRequestTasks(initial.request), initiallyVisible: document.visibilityState === "visible",
      read: async signal => {
        const response = await fetch(`/api/collection-requests/${encodeURIComponent(initial.request.id)}/progress?${query}`, { signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new ProgressReadError(data.error ?? "수집 현황을 확인하지 못했습니다.", response.status);
        return data;
      },
      isActive: data => hasActiveRequestTasks(data.request),
      onData: data => { setLive({ key, baseline: initial, snapshot: data }); setError(null); },
      onError: cause => setError({ key, baseline: initial, message: cause instanceof ProgressReadError ? cause.message : "현황 갱신에 실패했습니다. 마지막으로 확인한 상태를 표시합니다.", stopped: cause instanceof ProgressReadError && [400, 401, 403, 404].includes(cause.status) }),
      isFatal: cause => cause instanceof ProgressReadError && [400, 401, 403, 404].includes(cause.status),
    });
    const visibility = () => poller.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", visibility);
    return () => { document.removeEventListener("visibilitychange", visibility); poller.dispose(); };
  }, [initial, query, key]);

  return <>
    <RequestSummary request={snapshot.request} />
    <RequestProgressStages request={snapshot.request} />
    <p className="text-xs text-neutral-500">{currentError?.stopped ? "현황 조회를 중지했습니다. 접근 권한과 요청 상태를 확인한 뒤 새로고침하세요." : active ? "이 상세 화면을 보고 있는 동안 5초 간격으로 내부 상태를 확인합니다. 다른 탭으로 이동하면 일시 중지합니다." : "활성 작업이 없어 자동 갱신을 중지했습니다. 최신 상태가 필요하면 페이지를 새로고침하세요."} 외부 수집 API를 조회하거나 작업을 다시 제출하지 않습니다.</p>
    {currentError && <p role="alert" className="text-xs text-amber-700">{currentError.message}</p>}
    {children}
    <RequestRunList {...listProps} items={snapshot.items} total={snapshot.request.counts.total} />
  </>;
}
