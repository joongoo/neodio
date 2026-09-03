"use client";

import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { DataInsightRow } from "@/lib/db";

const SENTIMENT_LABEL: Record<DataInsightRow["sentiment"], string> = {
  positive: "우호적",
  neutral: "중립",
  negative: "비우호적",
};

// Matches Figma "Modal / Brand Presence Details" (node 646:17521) — opened
// from the Data Insights table's "상세" action.
export function BrandPresenceDetailsModal({ row, onClose }: { row: DataInsightRow | null; onClose: () => void }) {
  return (
    <Modal open={!!row} onClose={onClose}>
      {row && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">{row.topic}</h2>
            <ModalCloseButton onClose={onClose} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {row.source} · 인기도 {row.popularity}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="가시성 점수" value={`${row.visibilityScore}%`} />
            <Metric label="언급 수" value={row.mentions.toLocaleString("ko-KR")} />
            <Metric label="감성" value={SENTIMENT_LABEL[row.sentiment]} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <h3 className="text-xs font-bold text-neutral-500">자사 인용 ({row.ownCitations})</h3>
              <p className="mt-1 text-xs text-neutral-400">이 토픽에서 자사 도메인이 인용된 횟수입니다.</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-neutral-500">전체 인용 ({row.totalCitations})</h3>
              <p className="mt-1 text-xs text-neutral-400">이 토픽에서 인용된 모든 출처 수입니다.</p>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
    </div>
  );
}
