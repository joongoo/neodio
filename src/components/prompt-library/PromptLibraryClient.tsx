"use client";

import { useMemo, useState } from "react";
import { Download, Upload, Plus, Pencil, Trash2, Settings } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal } from "@/components/ui/ConfigureColumnsModal";
import { Pagination } from "@/components/ui/Pagination";
import { AddPromptModal, EditPromptModal, ImportPromptsModal } from "@/components/prompt-library/PromptLibraryModals";
import { PromptLibraryHealth, PromptLibraryRow } from "@/lib/db";

const ORIGIN_COLOR: Record<PromptLibraryRow["origin"], string> = {
  ai_generated: "bg-purple-500",
  manual: "bg-slate-500",
  csv_import: "bg-emerald-500",
};

export function PromptLibraryClient({
  initialRows,
  health,
}: {
  initialRows: PromptLibraryRow[];
  health: PromptLibraryHealth | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [subcategory, setSubcategory] = useState("전체");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PromptLibraryRow | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(["origin", "category", "subcategory", "lastModifiedAt", "lastModifiedBy"])
  );

  const categoryOptions = ["전체", ...new Set(rows.map((r) => r.category))];
  const subcategoryOptions = [
    "전체",
    ...new Set(rows.filter((r) => category === "전체" || r.category === category).map((r) => r.subcategory)),
  ];

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (category !== "전체" && r.category !== category) return false;
      if (subcategory !== "전체" && r.subcategory !== subcategory) return false;
      if (search && !r.prompt.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, category, subcategory, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSelected() {
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
  }

  const optionalColumns = [
    { key: "origin", label: "출처" },
    { key: "category", label: "카테고리" },
    { key: "subcategory", label: "서브카테고리" },
    { key: "lastModifiedAt", label: "최종 수정일" },
    { key: "lastModifiedBy", label: "수정자" },
  ];

  const allColumns: DataTableColumn<PromptLibraryRow>[] = [
    {
      key: "select",
      label: "",
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
    { key: "prompt", label: "프롬프트", width: "w-[360px]", render: (r) => <span className="truncate text-neutral-700">{r.prompt}</span> },
    {
      key: "origin",
      label: "출처",
      width: "w-[60px]",
      render: (r) => <span className={`size-4 rounded ${ORIGIN_COLOR[r.origin]}`} aria-hidden />,
    },
    { key: "category", label: "카테고리", width: "w-[100px]", render: (r) => <span className="text-neutral-600">{r.category}</span> },
    { key: "subcategory", label: "서브카테고리", width: "w-[130px]", render: (r) => <span className="truncate text-neutral-600">{r.subcategory}</span> },
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
              setRows((prev) => prev.filter((row) => row.id !== r.id));
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
        <Dropdown variant="solid" label="마켓" value="US-en" options={["US-en", "KR-ko"]} />
      </div>

      <InfoBanner
        title="프롬프트 라이브러리는 어떻게 동작하나요"
        description="AI 플랫폼 전반에서 브랜드 가시성을 측정하는 데 사용되는 프롬프트를 살펴보세요. 토픽별로 프롬프트를 탐색하고, 어떤 질문이 제기되는지 파악하고, 브랜드 존재감과 경쟁 포지셔닝을 개선할 기회를 발견하세요."
        actionLabel="개요 영상 보기"
      />

      {health && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HealthCard
            label="브랜디드 / 언브랜디드"
            badge={health.brandedRatio > health.brandedTarget ? "조치 필요" : undefined}
            value={`${health.brandedRatio}%`}
            note={`최대 목표치(${health.brandedTarget}%)보다 ${health.brandedRatio - health.brandedTarget}%p 높습니다.`}
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
        <Button variant="secondary" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
          CSV 가져오기
        </Button>
        <Button variant="secondary" icon={<Download size={14} />}>
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
              setSubcategory("전체");
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500">서브카테고리</span>
          <Dropdown
            variant="solid"
            label=""
            value={subcategory}
            options={subcategoryOptions}
            onChange={(v) => {
              setSubcategory(v);
              setPage(1);
            }}
          />
        </div>
        <div className="flex-1" />
        {selected.size > 0 && (
          <Button variant="secondary" onClick={deleteSelected}>
            선택 삭제 ({selected.size})
          </Button>
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
        onAdd={(row) => setRows((prev) => [{ id: `pl-${Date.now()}`, origin: "manual", ...row }, ...prev])}
      />
      <EditPromptModal
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={(id, patch) =>
          setRows((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, ...patch, lastModifiedAt: new Date().toISOString().slice(0, 10), lastModifiedBy: "나" }
                : r
            )
          )
        }
      />
      <ImportPromptsModal open={importOpen} onClose={() => setImportOpen(false)} />
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
