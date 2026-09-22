"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, Plus, Pencil, Trash2, Settings, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { AddPromptModal, EditPromptModal, ImportPromptsModal, ImportedPromptRow } from "@/components/prompt-library/PromptLibraryModals";
import { PromptLibraryOptimizeModal } from "@/components/prompt-library/PromptLibraryOptimizeModal";
import { BulkCollectionModal } from "@/components/prompt-library/BulkCollectionModal";
import { PromptLibraryHealth, PromptLibraryRow } from "@/lib/db";
import { downloadCsv } from "@/lib/csv";

const ORIGIN_LABEL: Record<PromptLibraryRow["origin"], string> = {
  ai_generated: "AI 생성",
  manual: "수동 입력",
  csv_import: "CSV 가져오기",
};

export function PromptLibraryClient({
  initialRows,
  health,
  topicOptionsByCategory,
  uncategorizedTopicOptions,
}: {
  initialRows: PromptLibraryRow[];
  health: PromptLibraryHealth | null;
  /** 카테고리별 기존 토픽 목록 — 추적/편집 모달의 토픽 드롭다운에 쓴다. */
  topicOptionsByCategory: Record<string, string[]>;
  uncategorizedTopicOptions: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  // 오늘 추가/수정된 항목을 "NEW"로 표시 — 프롬프트 전략/가시성 개요에서
  // 방금 추적했거나, 방금 CSV로 가져왔거나, 방금 직접 추가한 프롬프트가
  // 오늘 날짜로 lastModifiedAt이 찍히므로 이걸로 판별한다.
  const today = new Date().toISOString().slice(0, 10);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [topic, setTopic] = useState("전체");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PromptLibraryRow | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(["origin", "category", "topic", "lastModifiedAt", "lastModifiedBy"])
  );

  const categoryOptions = ["전체", ...new Set(rows.map((r) => r.category))];
  const topicOptions = [
    "전체",
    ...new Set(rows.filter((r) => category === "전체" || r.category === category).map((r) => r.topic)),
  ];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (category !== "전체" && r.category !== category) return false;
      if (topic !== "전체" && r.topic !== topic) return false;
      if (search && !r.prompt.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, category, topic, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // 현재 필터(검색어/카테고리/토픽) 적용된 결과만 내보낸다 — 화면에
  // 보이는 것과 CSV가 일치해야 하므로 전체 rows가 아니라 filtered 기준.
  function exportCsv() {
    downloadCsv(
      "prompt-library.csv",
      ["prompt", "category", "topic", "origin", "lastModifiedAt", "lastModifiedBy"],
      filtered.map((r) => [r.prompt, r.category, r.topic, r.origin, r.lastModifiedAt ?? "", r.lastModifiedBy ?? ""])
    );
  }

  // CSV로 가져온 행도 실제로 .tmp에 저장한다 — 이전엔 로컬 state에만 남아서
  // 새로고침하면 통째로 사라졌다.
  async function importCsv(imported: ImportedPromptRow[]) {
    const results = await Promise.all(
      imported.map((r) =>
        fetch("/api/tracked-topics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: r.prompt, category: r.category, topic: r.topic, origin: "csv_import" }),
        }).then((res) => res.json())
      )
    );
    const newRows = results.filter((r) => r.ok).map((r) => r.row as PromptLibraryRow);
    setRows((prev) => [...new Map([...prev, ...newRows].map(row => [row.id, row])).values()]);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 추적/수동 추가/CSV로 들어온 프롬프트(id가 "tracked-"로 시작)는 실제
  // .tmp 파일을 지운다. mock 시드 행(pl-*)은 지울 파일이 없는 대신 "삭제된
  // id 목록"에 기록한다 — 이전엔 이 기록이 없어서 새로고침하면 시드 데이터가
  // 그대로 부활했다. 둘 다 서버 API를 호출해 실제로 영구 반영한다.
  function deleteRows(ids: Set<string>) {
    setRows((prev) => prev.filter((r) => !ids.has(r.id)));
    ids.forEach((id) => {
      fetch(`/api/tracked-topics?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    });
  }

  function deleteSelected() {
    deleteRows(selected);
    setSelected(new Set());
  }

  const optionalColumns = [
    { key: "origin", label: "출처" },
    { key: "category", label: "카테고리" },
    { key: "topic", label: "토픽" },
    { key: "lastModifiedAt", label: "최종 수정일" },
    { key: "lastModifiedBy", label: "수정자" },
  ];

  const allColumns: DataTableColumn<PromptLibraryRow>[] = [
    {
      key: "select",
      label: (
        <input
          type="checkbox"
          aria-label="현재 페이지 전체 선택"
          checked={pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))}
          ref={(el) => {
            if (el) el.indeterminate = pageRows.some((r) => selected.has(r.id)) && !pageRows.every((r) => selected.has(r.id));
          }}
          onChange={(e) => {
            setSelected((prev) => {
              const next = new Set(prev);
              pageRows.forEach((r) => (e.target.checked ? next.add(r.id) : next.delete(r.id)));
              return next;
            });
          }}
          className="size-4 cursor-pointer accent-slate-800"
        />
      ),
      width: "w-[24px]",
      render: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(r.id)}
          className="size-4 cursor-pointer accent-slate-800"
        />
      ),
    },
    {
      key: "prompt",
      label: "프롬프트",
      width: "w-[360px]",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-neutral-700">{r.prompt}</span>
          {r.lastModifiedAt === today && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">NEW</span>
          )}
        </span>
      ),
    },
    {
      key: "origin",
      label: "출처",
      width: "w-[100px]",
      render: (r) => <span className="text-xs text-neutral-500">{ORIGIN_LABEL[r.origin]}</span>,
    },
    { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => <span className="text-neutral-600">{r.category}</span> },
    { key: "topic", label: "토픽", width: "w-[130px]", render: (r) => <span className="truncate text-neutral-600">{r.topic}</span> },
    { key: "lastModifiedAt", label: "최종 수정일", width: "w-[100px]", render: (r) => <span className="text-neutral-500">{r.lastModifiedAt ?? "—"}</span> },
    { key: "lastModifiedBy", label: "수정자", width: "w-[90px]", render: (r) => <span className="text-neutral-500">{r.lastModifiedBy ?? "—"}</span> },
    {
      key: "action",
      label: "액션",
      width: "w-[60px]",
      render: (r) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="편집"
            onClick={(e) => {
              e.stopPropagation();
              setEditingRow(r);
            }}
            className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            aria-label="삭제"
            onClick={(e) => {
              e.stopPropagation();
              deleteRows(new Set([r.id]));
            }}
            className="text-neutral-400 hover:text-red-600 cursor-pointer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const columns = allColumns.filter((c) => !optionalColumns.some((o) => o.key === c.key) || visibleCols.has(c.key));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">프롬프트 라이브러리</h1>
        {/* 프롬프트 라이브러리는 마켓별로 프롬프트를 나누지 않는다(PromptLibraryRow에
            market 필드 자체가 없음) — 실제로 필터링되지 않던 장식용
            드롭다운(US-en/KR-ko, 클릭해도 아무 동작 안 함) 대신 실제 서비스
            시장(KR)을 있는 그대로 보여준다. */}
        <span className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">마켓: KR</span>
      </div>

      <InfoBanner
        title="프롬프트 라이브러리는 어떻게 동작하나요"
        description="AI 플랫폼 전반에서 브랜드 가시성을 측정하는 데 사용되는 프롬프트를 살펴보세요. 토픽별로 프롬프트를 탐색하고, 어떤 질문이 제기되는지 파악하고, 브랜드 존재감과 경쟁 포지셔닝을 개선할 기회를 발견하세요."
        actionLabel="도움말 보기"
        onAction={() => router.push("/help/prompt-library")}
      />

      {health && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HealthCard
            label="브랜디드 / 언브랜디드"
            badge={health.brandedRatio > health.brandedTarget ? "조치 필요" : undefined}
            value={`${health.brandedRatio}%`}
            note={
              health.brandedRatio > health.brandedTarget
                ? `최대 목표치(${health.brandedTarget}%)보다 ${health.brandedRatio - health.brandedTarget}%p 높습니다.`
                : `최대 목표치(${health.brandedTarget}%) 이내입니다.`
            }
          />
          <HealthCard
            label="토픽 의도 일치도"
            badge={health.topicIntentMatchCount === 0 ? "조치 필요" : undefined}
            value={`${health.topicIntentMatchCount} of ${health.topicIntentTotal}`}
            note={`${health.topicIntentTotal - health.topicIntentMatchCount}개 토픽이 의도에서 벗어남.`}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="프롬프트 검색"
          className="h-10 w-[260px] rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-slate-500"
        />
        <div className="flex-1" />
        <Button variant="secondary" icon={<Sparkles size={14} />} onClick={() => setOptimizeOpen(true)}>
          라이브러리 최적화
        </Button>
        <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
          CSV 가져오기
        </Button>
        <Button variant="secondary" icon={<Download size={14} />} onClick={exportCsv}>
          CSV 내보내기
        </Button>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
          프롬프트 추가
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500">카테고리</span>
          <Dropdown
            variant="solid"
            label=""
            value={category}
            options={categoryOptions}
            onChange={(v) => {
              setCategory(v);
              setTopic("전체");
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500">토픽</span>
          <Dropdown
            variant="solid"
            label=""
            value={topic}
            options={topicOptions}
            onChange={(v) => {
              setTopic(v);
              setPage(1);
            }}
          />
        </div>
        <div className="flex-1" />
        {selected.size > 0 && (
          <>
            <Button variant="secondary" onClick={() => setCollectOpen(true)}>
              선택 수집 ({selected.size})
            </Button>
            <Button variant="secondary" onClick={deleteSelected}>
              선택 삭제 ({selected.size})
            </Button>
          </>
        )}
        <button
          type="button"
          aria-label="컬럼 설정"
          onClick={() => setColumnsOpen(true)}
          className="grid size-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
        >
          <Settings size={16} />
        </button>
      </div>

      <div className="w-full rounded-xl border border-neutral-200 bg-white">
        <DataTable columns={columns} rows={pageRows} getRowId={(r) => r.id} />
        <div className="p-4">
          <Pagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            totalCount={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </div>

      <AddPromptModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={async (row) => {
          // 실제로 .tmp에 저장한다 — 이전엔 로컬 state에만 남아서 새로고침하면
          // 사라졌다.
          const res = await fetch("/api/tracked-topics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: row.prompt, category: row.category, topic: row.topic, origin: "manual" }),
          });
          const data = await res.json();
          if (data.ok) setRows((prev) => [data.row as PromptLibraryRow, ...prev.filter(r => r.id !== data.row.id)]);
        }}
        existingPrompts={rows.map((r) => r.prompt)}
        topicOptionsByCategory={topicOptionsByCategory}
        uncategorizedTopicOptions={uncategorizedTopicOptions}
      />
      <EditPromptModal
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={async (id, patch) => {
          // Imported rows and newly tracked rows use the same database update.
          if (id.startsWith("tracked-") || id.startsWith("pl-")) {
            const res = await fetch(`/api/tracked-topics?id=${encodeURIComponent(id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
            const data = await res.json();
            if (data.ok) {
              setRows((prev) => prev.map((r) => (r.id === id ? (data.row as PromptLibraryRow) : r)));
              return;
            }
            window.alert(data.error ?? "프롬프트를 저장하지 못했습니다.");
            return;
          }
          setRows((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, ...patch, lastModifiedAt: new Date().toISOString().slice(0, 10), lastModifiedBy: "나" }
                : r
            )
          );
        }}
        existingPrompts={rows.filter((r) => r.id !== editingRow?.id).map((r) => r.prompt)}
        topicOptionsByCategory={topicOptionsByCategory}
        uncategorizedTopicOptions={uncategorizedTopicOptions}
      />
      <ImportPromptsModal open={importOpen} onClose={() => setImportOpen(false)} onImport={importCsv} existingPrompts={rows.map((r) => r.prompt)} />
      <PromptLibraryOptimizeModal
        open={optimizeOpen}
        onClose={() => setOptimizeOpen(false)}
        rows={rows}
        onApplied={({ deletedIds, updatedRows }) => {
          const deleted = new Set(deletedIds);
          const updatedById = new Map(updatedRows.map((r) => [r.id, r]));
          setRows((prev) => prev.filter((r) => !deleted.has(r.id)).map((r) => updatedById.get(r.id) ?? r));
          setSelected((prev) => {
            const next = new Set(prev);
            deleted.forEach((id) => next.delete(id));
            return next;
          });
        }}
      />
      <BulkCollectionModal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        keywords={rows.filter((r) => selected.has(r.id)).map((r) => r.prompt)}
        onDone={() => setSelected(new Set())}
      />
      <ConfigureColumnsModal
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={optionalColumns}
        visible={visibleCols}
        onApply={setVisibleCols}
      />
    </div>
  );
}

function HealthCard({
  label,
  badge,
  value,
  note,
}: {
  label: string;
  badge?: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        <Tooltip text={`${label}는 우리가 실행한 프롬프트/토픽 데이터를 집계한 값입니다.`} />
        <div className="flex-1" />
        {badge && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">{badge}</span>}
      </div>
      <span className="text-xl font-bold text-neutral-900">{value}</span>
      <p className="text-[11px] text-neutral-500">{note}</p>
    </Card>
  );
}
