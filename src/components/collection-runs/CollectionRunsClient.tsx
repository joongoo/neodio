"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { TablePanel } from "@/components/ui/TablePanel";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { FaviconIcon } from "@/components/ui/FaviconIcon";
import { Button } from "@/components/ui/Button";
import { CollectionRunForm } from "@/components/collection-runs/CollectionRunForm";
import { Pagination } from "@/components/ui/Pagination";
import { formatKst } from "@/lib/backend/collectionRunsTypes";
import type { CollectedRunDetail } from "@/lib/backend/collectionRuns";
import { engineLabel, RUN_PAGE_SIZES, type RunListPage, type RunListRow } from "@/lib/collectionRunList";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTenantBase } from "@/lib/useTenantBase";

function StatusBadge({ file }: { file: RunListRow }) {
  if (file.state === "blocked") {
    return <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">차단됨(캡차)</span>;
  }
  if (file.state === "success") {
    return <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">성공</span>;
  }
  return <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">실패</span>;
}

function runColumns(onAnalyze: (file: RunListRow) => void): DataTableColumn<RunListRow>[] {
  return [
    {
      key: "runAt",
      label: "수집 시각 (KST)",
      width: "w-[170px]",
      render: (file) => <span className="text-neutral-700">{formatKst(file.runAt)}</span>,
    },
    {
      key: "engine",
      label: "엔진",
      width: "w-[150px]",
      render: (file) => (
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {engineLabel(file)}
        </span>
      ),
    },
    {
      key: "query",
      label: "키워드",
      width: "w-[140px]",
      render: (file) => <span className="font-medium text-neutral-800">{file.query}</span>,
    },
    {
      key: "status",
      label: "상태",
      width: "w-[110px]",
      render: (file) => <StatusBadge file={file} />,
    },
    {
      key: "length",
      label: "답변 길이",
      width: "w-[90px]",
      render: (file) => file.answerLength,
    },
    {
      key: "citations",
      label: "인용 수",
      width: "w-[80px]",
      render: (file) => file.citationCount,
    },
    {
      key: "category",
      label: "카테고리",
      width: "w-[130px]",
      render: (file) =>
        file.category ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {file.category}
          </span>
        ) : (
          <span className="text-[11px] text-neutral-400">미분류</span>
        ),
    },
    {
      key: "analyze",
      label: "",
      width: "w-[90px]",
      render: (file) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAnalyze(file);
          }}
          className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
        >
          분석
        </button>
      ),
    },
  ];
}

// 원문·인용은 행을 펼칠 때 처음 불러온다(목록 payload에는 싣지 않는다).
function RunDetail({ file }: { file: RunListRow }) {
  const [state, setState] = useState<{ detail?: CollectedRunDetail; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/collection-runs/detail?dir=${encodeURIComponent(file.dir)}&filename=${encodeURIComponent(file.filename)}`)
      .then(async (res) => (res.ok ? { detail: (await res.json()) as CollectedRunDetail } : { error: (await res.json().catch(() => null))?.error ?? "원문을 불러오지 못했습니다." }))
      .catch(() => ({ error: "원문을 불러오지 못했습니다." }))
      .then((result) => {
        if (!cancelled) setState(result);
      });
    return () => {
      cancelled = true;
    };
  }, [file.dir, file.filename]);

  if (!state) return <p className="text-xs text-neutral-400">원문을 불러오는 중…</p>;
  if (!state.detail) return <p className="text-xs text-red-600">{state.error}</p>;
  const { detail } = state;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <p className="mb-1 font-bold text-neutral-500">저장된 답변 원문 (rawResponse)</p>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-3 leading-relaxed text-neutral-700">
          {detail.rawResponse || "(내용 없음)"}
        </pre>
      </div>
      {detail.citations.length > 0 && (
        <div>
          <p className="mb-1 font-bold text-neutral-500">인용 소스 ({detail.citations.length})</p>
          <div className="flex flex-col gap-1">
            {detail.citations.map((c) => (
              <div key={c.url} className="flex items-center gap-2 truncate text-neutral-600">
                <span className={`size-2 shrink-0 rounded-full ${c.isOwnDomain ? "bg-emerald-500" : "bg-neutral-300"}`} aria-hidden />
                <FaviconIcon domain={c.domain} />
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-neutral-400">{c.domain}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-400">
        <span>query URL: {detail.queryUrl}</span>
        {detail.screenshotPath && <span>screenshot: {detail.screenshotPath}</span>}
      </div>
    </div>
  );
}

export function CollectionRunsClient({
  listPage,
  search,
  stats,
  categories,
}: {
  listPage: RunListPage;
  search: string;
  stats: { total: number; success: number; ownMentions: number; ownCitations: number };
  categories: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tenantBase = useTenantBase();
  const [analyzingFile, setAnalyzingFile] = useState<RunListRow | null>(null);
  const [searchText, setSearchText] = useState(search);
  const columns = runColumns((file) => setAnalyzingFile(file));

  // 페이지·검색은 주소(쿼리)에 두어 서버가 한 페이지만 보낸다.
  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  // 입력할 때마다 서버를 부르지 않도록 잠깐 멈추면 검색한다.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (searchText === search) return;
    const timer = setTimeout(() => navigate({ q: searchText.trim() || null, page: null }), 350);
    return () => clearTimeout(timer);
    // navigate는 매 렌더 새로 만들어지지만 입력값이 바뀔 때만 다시 예약하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">수집 로그</h1>
        <p className="mt-1 text-sm text-neutral-500">
          네이버 AI검색·구글AI모드·구글AIO 수집(설치형 수집기, `collect:naver-ai` / `collect:google-ai` / YouTube AIO 트래커)과 LLM API 수집(`collect:llm`)이 저장한 실행을 그대로 나열합니다.
        </p>
      </div>

      <CollectionRunForm />

      <div className="h-px w-full bg-neutral-200" />

      {stats.total === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          아직 수집된 실행이 없습니다. 위에서 키워드를 입력해 수집을 시작해 보세요.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SimpleStatCard label="수집 실행 수" value={stats.total} tooltip="지금까지 저장된 수집 실행 수입니다." />
            <SimpleStatCard
              label="성공한 실행"
              value={stats.success}
              tooltip="봇 차단 없이 실제 답변 텍스트를 얻은 실행 수입니다."
            />
            <SimpleStatCard label="브랜드 언급" value={stats.ownMentions} tooltip="수집된 답변 중 우리 브랜드가 언급된 횟수입니다." />
            <SimpleStatCard label="브랜드 인용" value={stats.ownCitations} tooltip="수집된 답변이 우리 도메인을 인용한 횟수입니다." />
          </div>

          <TablePanel
            title="수집 실행 목록"
            description="행을 클릭하면 저장된 원문과 인용 소스를 볼 수 있습니다."
            count={listPage.filteredTotal}
            total={stats.total}
            searchValue={searchText}
            onSearchChange={setSearchText}
            searchPlaceholder="키워드/엔진/카테고리 검색"
          >
            {listPage.filteredTotal === 0 ? (
              <p className="p-6 text-center text-sm text-neutral-500">검색 결과가 없습니다.</p>
            ) : (
              <>
                <DataTable columns={columns} rows={listPage.rows} getRowId={(file) => file.key} renderExpanded={(file) => <RunDetail file={file} />} />
                <div className="mt-3">
                  <Pagination
                    page={listPage.page}
                    pageCount={listPage.pageCount}
                    pageSize={listPage.pageSize}
                    totalCount={listPage.filteredTotal}
                    pageSizeOptions={RUN_PAGE_SIZES}
                    onPageChange={(page) => navigate({ page: page === 1 ? null : String(page) })}
                    onPageSizeChange={(size) => navigate({ size: String(size), page: null })}
                  />
                </div>
              </>
            )}
          </TablePanel>

          <InfoBanner
            title="이 원문·인용 데이터가 다음 LLM 분석 단계의 입력입니다"
            description="브랜드 언급/인용은 이미 이 페이지에서 실시간으로 계산됩니다. 다음 단계는 이 결과를 LLM에 전달해 프롬프트 전략과 기회를 자동 제안하는 것입니다."
            actionLabel="프롬프트 전략에서 확인"
            onAction={() => router.push(`${tenantBase}/prompt-strategy`)}
          />
        </>
      )}

      <CategorizeRunModal
        file={analyzingFile}
        categories={categories}
        onClose={() => setAnalyzingFile(null)}
        onSaved={() => {
          setAnalyzingFile(null);
          router.refresh();
        }}
      />
    </div>
  );
}

// "분석" 버튼의 첫 단계 — 프롬프트 라이브러리의 "프롬프트 추가" 모달(AddPromptModal)과
// 같은 카테고리 목록/레이아웃으로 이 실행을 분류한다. 수집 시점엔 카테고리를 안 받으므로
// (키워드만 입력), 여기서 사후에 태그를 붙여야 Overview의 카테고리 필터가 실 데이터에
// 적용될 수 있다. LLM 기반 프롬프트 제안 생성은 이 모달의 다음 단계로 남겨둠 — 실제 LLM
// 호출에 필요한 API 키가 아직 설정돼 있지 않음.
function CategorizeRunModal({
  file,
  categories,
  onClose,
  onSaved,
}: {
  file: RunListRow | null;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 선택한 수집 파일이 바뀌면 폼 초기화
    setCategory(file?.category ?? "");
    setTopic(file?.topic ?? "");
    setError(null);
  }, [file]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !category) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/collection-runs/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: file.dir, filename: file.filename, category, topic }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "저장에 실패했습니다.");
      return;
    }
    setCategory("");
    setTopic("");
    onSaved();
  }

  function close() {
    setCategory("");
    setTopic("");
    setError(null);
    onClose();
  }

  return (
    <Modal open={file !== null} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">이 실행 분류</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        키워드 &quot;{file?.query}&quot;로 수집된 실행을 카테고리에 태그합니다.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-500">카테고리 *</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          >
            <option value="" disabled>
              선택하세요
            </option>
            {categories.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-500">토픽</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            placeholder="예: 캠페인 운영 기법"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!category || saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
