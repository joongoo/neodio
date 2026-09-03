"use client";

import { useMemo, useState } from "react";
import { Settings, Download } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { TopicCategory, TopicRow } from "@/lib/db";

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "top-prompts": "이미 브랜드가 언급된 토픽의 프롬프트입니다.",
  "topic-opportunities": "아직 브랜드가 언급되지 않은 토픽 기회입니다.",
  "latest-top-brands": "이 토픽에서 최근 가장 많이 언급된 브랜드입니다.",
  "cited-pages": "AI 답변에 가장 많이 인용된 페이지입니다.",
  "cited-sources": "AI 답변이 가장 많이 인용한 출처입니다.",
  "source-opportunities": "아직 우리 브랜드가 인용되지 않은 출처 기회입니다.",
};

const columns: DataTableColumn<TopicRow>[] = [
  { key: "topic", label: "토픽", width: "w-[240px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
  {
    key: "searchVolume",
    label: "검색량",
    width: "w-[110px]",
    render: (r) => r.searchVolume.toLocaleString("ko-KR"),
  },
  { key: "mentions", label: "언급 수", width: "w-[90px]", render: (r) => r.mentions },
  { key: "visibility", label: "가시성", width: "w-[90px]", render: (r) => `${r.visibility}%` },
  { key: "difficulty", label: "난이도", width: "w-[90px]", render: (r) => `${r.difficulty}%` },
  {
    key: "market",
    label: "마켓",
    width: "w-[90px]",
    render: (r) => (
      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{r.market}</span>
    ),
  },
  {
    key: "action",
    width: "w-[100px]",
    label: "액션",
    render: () => (
      <button className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer">
        추적
      </button>
    ),
  },
];

export function TopicsTableSection({
  categories,
  topicsByCategory,
}: {
  categories: TopicCategory[];
  topicsByCategory: Record<string, TopicRow[]>;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const category = categories.find((c) => c.id === categoryId);
  const allRows = useMemo(() => topicsByCategory[categoryId] ?? [], [topicsByCategory, categoryId]);
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize));
  const rows = useMemo(
    () => allRows.slice((page - 1) * pageSize, page * pageSize),
    [allRows, page, pageSize]
  );

  function selectCategory(id: string) {
    setCategoryId(id);
    setPage(1);
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <Tabs
        variant="badge"
        items={categories.map((c) => ({ id: c.id, label: c.label, badge: c.badge }))}
        value={categoryId}
        onChange={selectCategory}
      />

      <div className="mt-4 flex items-start gap-3">
        <div className="flex-1">
          <h3 className="text-base font-bold text-neutral-900">{category?.label}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {CATEGORY_DESCRIPTIONS[categoryId] ?? ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="설정"
          className="grid size-9 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
        >
          <Settings size={16} />
        </button>
        <Button variant="primary" icon={<Download size={16} />}>
          내보내기
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2.5">
        <Dropdown label="" value="AI 가시성: 전체" bold options={["AI 가시성: 전체"]} />
        <div className="flex h-10 w-[189px] items-center justify-end rounded-md border border-neutral-300 px-3">
          <span className="text-xs text-neutral-500">
            0/{category?.badge ?? allRows.length}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          renderExpanded={(row) => (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 border-b border-neutral-100 pb-2 text-xs font-bold text-neutral-500">
                <span className="w-[280px]">프롬프트</span>
                <span className="w-[110px]">모델</span>
                <span className="w-[70px]">내 브랜드</span>
                <span className="w-[70px]">브랜드</span>
                <span className="w-[70px]">소스</span>
                <span className="w-[70px]">마켓</span>
              </div>
              {row.prompts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-xs text-neutral-700">
                  <span className="w-[280px] truncate">{p.prompt}</span>
                  <span className="w-[110px]">{p.model}</span>
                  <span className="w-[70px]">{p.myBrand}</span>
                  <span className="w-[70px]">{p.brand}</span>
                  <span className="w-[70px]">{p.source}</span>
                  <span className="w-[70px]">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      {p.market}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        />
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalCount={allRows.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
