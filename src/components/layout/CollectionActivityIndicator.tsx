import { CircleAlert, CircleHelp, Loader2 } from "lucide-react";
import type { CollectionActivityStatus } from "@/lib/collectionActivityStatus";

export function CollectionActivityIndicator({ state }: { state: CollectionActivityStatus }) {
  if (state.status !== "ready") {
    const label = state.status === "loading" ? "수집 상태 확인 중" : "수집 상태 확인 불가";
    return <span title={label} aria-label={label} className="inline-flex shrink-0 text-neutral-400"><CircleHelp size={15} aria-hidden="true" /></span>;
  }
  if (!state.running && !state.attention) return null;
  return <span className="inline-flex shrink-0 items-center gap-1.5">
    {state.running && <span title="수집 진행 중" aria-label="수집 진행 중" className="inline-flex text-blue-600"><Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /></span>}
    {state.attention && <span title="확인 필요한 수집 항목 있음" aria-label="확인 필요한 수집 항목 있음" className="inline-flex text-orange-600"><CircleAlert size={15} aria-hidden="true" /></span>}
  </span>;
}
