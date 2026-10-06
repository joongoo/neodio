"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import type { ChangeEntity, ChangeEntry, ConfigVersion } from "@/lib/changeLog";

const ENTITY_LABEL: Record<ChangeEntity, string> = {
  prompt: "프롬프트",
  tracking: "프롬프트 상태",
  topic_groups: "토픽 묶음",
  brand: "브랜드 설정",
};

const OP_STYLE: Record<ChangeEntry["op"], string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-sky-100 text-sky-700",
  delete: "bg-red-100 text-red-700",
};
const OP_LABEL: Record<ChangeEntry["op"], string> = { create: "추가", update: "변경", delete: "삭제" };

function formatAt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  return JSON.stringify(value, null, 1).slice(0, 600);
}

// 변경 전·후 값을 나란히 — 바뀐 필드마다 한 줄씩.
function ChangeDetail({ entry }: { entry: ChangeEntry }) {
  const before = (entry.before && typeof entry.before === "object" ? entry.before : null) as Record<string, unknown> | null;
  const after = (entry.after && typeof entry.after === "object" ? entry.after : null) as Record<string, unknown> | null;
  if (entry.entityType === "topic_groups") {
    const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return <p className="text-xs text-neutral-500">토픽 {count(entry.before)}개 → {count(entry.after)}개. 자세한 비교는 저장된 버전으로 확인할 수 있어요.</p>;
  }
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[110px_1fr_1fr] gap-3 text-xs">
          <span className="font-medium text-neutral-500">{key}</span>
          <pre className="whitespace-pre-wrap rounded bg-red-50 px-2 py-1 text-neutral-700">{renderValue(before?.[key])}</pre>
          <pre className="whitespace-pre-wrap rounded bg-emerald-50 px-2 py-1 text-neutral-700">{renderValue(after?.[key])}</pre>
        </div>
      ))}
    </div>
  );
}

export function ChangeHistoryClient({
  initialChanges,
  versions,
  pageSize,
}: {
  initialChanges: ChangeEntry[];
  versions: ConfigVersion[];
  pageSize: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"changes" | "versions">("changes");
  const [changes, setChanges] = useState(initialChanges);
  const [hasMore, setHasMore] = useState(initialChanges.length >= pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    const last = changes[changes.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const res = await fetch(`/api/change-log?limit=${pageSize}&before=${encodeURIComponent(last.at)}`);
    const data = (await res.json()) as { changes: ChangeEntry[] };
    setChanges((prev) => [...prev, ...data.changes]);
    setHasMore(data.changes.length >= pageSize);
    setLoadingMore(false);
  }

  async function saveVersion(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/config-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, note }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "저장에 실패했습니다.");
      return;
    }
    setSaveOpen(false);
    setLabel("");
    setNote("");
    setTab("versions");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">변경 이력</h1>
          <p className="mt-1 text-sm text-neutral-500">
            프롬프트 추가·수정·보관, 토픽 묶음, 브랜드 설정이 언제 어떻게 바뀌었는지 기록합니다. 수집된 답변은 바뀌지 않는 원본이라 여기에 담지 않아요.
          </p>
        </div>
        <Button variant="primary" onClick={() => setSaveOpen(true)}>
          현재 설정을 버전으로 저장
        </Button>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["changes", `변경 이력 ${changes.length}${hasMore ? "+" : ""}`],
            ["versions", `저장된 버전 ${versions.length}`],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer ${
              tab === id ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "changes" ? (
        <Card className="p-0">
          {changes.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">
              아직 기록된 변경이 없어요. 이 기능을 켠 뒤의 프롬프트·브랜드 설정 변경부터 쌓여요.
            </p>
          ) : (
            <ul>
              {changes.map((entry) => {
                const open = openId === entry.id;
                return (
                  <li key={entry.id} className="border-b border-neutral-100 last:border-b-0">
                    <button type="button" onClick={() => setOpenId(open ? null : entry.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50 cursor-pointer">
                      <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${OP_STYLE[entry.op]}`}>{OP_LABEL[entry.op]}</span>
                      <span className="shrink-0 text-[11px] text-neutral-400">{ENTITY_LABEL[entry.entityType]}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{entry.summary}</span>
                      <span className="shrink-0 text-xs text-neutral-400">{entry.actorName ? `${entry.actorName} · ` : ""}{formatAt(entry.at)}</span>
                    </button>
                    {open && (
                      <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
                        <ChangeDetail entry={entry} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && (
            <div className="border-t border-neutral-100 p-3 text-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-0">
          {versions.length === 0 ? (
            <p className="p-8 text-center text-sm text-neutral-500">
              저장된 버전이 없어요. 프롬프트를 크게 바꾸기 전에 &ldquo;현재 설정을 버전으로 저장&rdquo;을 눌러 두면, 나중에 그 시점의 설정과 비교할 수 있어요.
            </p>
          ) : (
            <ul>
              {versions.map((v) => (
                <li key={v.id} className="flex items-start gap-4 border-b border-neutral-100 px-5 py-4 last:border-b-0">
                  <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">v{v.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">{v.label}</p>
                    {v.note && <p className="mt-0.5 whitespace-pre-wrap text-xs text-neutral-500">{v.note}</p>}
                    <p className="mt-1 text-xs text-neutral-400">
                      프롬프트 {v.stats.prompts}개 · 토픽 {v.stats.topics}개
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-neutral-400">{v.createdByName ? `${v.createdByName} · ` : ""}{formatAt(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">현재 설정을 버전으로 저장</h2>
          <ModalCloseButton onClose={() => setSaveOpen(false)} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">지금의 프롬프트 세트, 토픽 묶음, 브랜드 설정 전체를 이름을 붙여 보관해요.</p>
        <form onSubmit={saveVersion} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">버전 이름 *</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required placeholder="예: 10월 프롬프트 최적화 전" className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">메모</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="무엇을 왜 바꾸는지 적어 두면 나중에 도움이 돼요." className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={!label.trim() || saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
