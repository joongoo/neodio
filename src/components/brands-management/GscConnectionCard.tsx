import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GscConnection } from "@/lib/db";

// Matches Figma "Manage Connections" GSC tab (doc §23) — now scoped to a
// single brand instead of the whole org (each brand connects its own GSC
// property; see neodigm_p0_scope.md's GSC row).
export function GscConnectionCard({ gsc }: { gsc: GscConnection | null }) {
  if (!gsc || gsc.status === "disconnected") {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-base font-bold text-neutral-900">Google Search Console</h2>
        <p className="text-sm text-neutral-500">아직 연결되지 않았습니다.</p>
        <Button variant="primary">Google 계정으로 연결</Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-neutral-900">Google Search Console</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 size={14} />
          연결됨
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">계정</dt>
          <dd className="mt-0.5 text-neutral-800">{gsc.accountEmail}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">속성(Property)</dt>
          <dd className="mt-0.5 text-neutral-800">{gsc.property}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">마지막 동기화</dt>
          <dd className="mt-0.5 text-neutral-800">{new Date(gsc.lastSyncedAt).toLocaleString("ko-KR")}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-3 gap-3 border-t border-neutral-100 pt-4">
        <SyncedStat label="쿼리 수" value={gsc.syncedQueries} />
        <SyncedStat label="노출 수" value={gsc.syncedImpressions} />
        <SyncedStat label="클릭 수" value={gsc.syncedClicks} />
      </div>

      <div>
        <Button variant="secondary">계정 관리</Button>
      </div>
    </Card>
  );
}

function SyncedStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className="text-lg font-bold text-neutral-900">{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}
