"use client";

import { useState } from "react";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { TablePanel } from "@/components/ui/TablePanel";
import { SimpleStatCard } from "@/components/ui/SimpleStatCard";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { CollectionRunForm } from "@/components/collection-runs/CollectionRunForm";
import { BrandSeed } from "@/lib/db";
import { ProcessedPromptRuns } from "@/lib/backend/processing";
import { CollectedRunFile, formatKst, isBotBlocked } from "@/lib/backend/collectionRunsTypes";
import { useRouter } from "next/navigation";

const ENGINE_LABEL: Record<string, string> = {
  "naver-ai-search": "네이버 AI검색",
  "google-ai-overview": "Google AI Overview",
};

function StatusBadge({ file }: { file: CollectedRunFile }) {
  if (isBotBlocked(file.promptRun)) {
    return <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">차단됨(캡차)</span>;
  }
  if (file.promptRun.status === "success") {
    return <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">성공</span>;
  }
  return <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">실패</span>;
}

function runColumns(onAnalyze: (file: CollectedRunFile) => void): DataTableColumn<CollectedRunFile>[] {
  return [
    {
      key: "runAt",
      label: "수집 시각 (KST)",
      width: "w-[170px]",
      render: (f) => <span className="text-neutral-700">{formatKst(f.promptRun.runAt)}</span>,
    },
    {
      key: "engine",
      label: "엔진",
      width: "w-[150px]",
      render: (f) => (
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {ENGINE_LABEL[f.promptRun.rawMetadata.source] ?? f.promptRun.rawMetadata.source}
        </span>
      ),
    },
    {
      key: "query",
      label: "키워드",
      width: "w-[140px]",
      render: (f) => <span className="font-medium text-neutral-800">{f.promptRun.rawMetadata.query}</span>,
    },
    { key: "status", label: "상태", width: "w-[110px]", render: (f) => <StatusBadge file={f} /> },
    {
      key: "length",
      label: "답변 길이",
      width: "w-[90px]",
      render: (f) => f.promptRun.rawMetadata.answerTextLength ?? f.promptRun.rawResponse.length,
    },
    {
      key: "citations",
      label: "인용 수",
      width: "w-[80px]",
      render: (f) => f.promptRun.rawMetadata.citations?.length ?? 0,
    },
    {
      key: "analyze",
      label: "",
      width: "w-[80px]",
      render: (f) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAnalyze(f);
          }}
          className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer"
        >
          분석
        </button>
      ),
    },
  ];
}

function RunDetail({ file }: { file: CollectedRunFile }) {
  const { promptRun } = file;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <p className="mb-1 font-bold text-neutral-500">저장된 답변 원문 (rawResponse)</p>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-3 leading-relaxed text-neutral-700">
          {promptRun.rawResponse || "(내용 없음)"}
        </pre>
      </div>
      {(promptRun.rawMetadata.citations?.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 font-bold text-neutral-500">인용 소스 ({promptRun.rawMetadata.citations!.length})</p>
          <div className="flex flex-col gap-1">
            {promptRun.rawMetadata.citations!.map((c) => (
              <div key={c.url} className="flex items-center gap-2 truncate text-neutral-600">
                <span className={`size-2 shrink-0 rounded-full ${c.isOwnDomain ? "bg-emerald-500" : "bg-neutral-300"}`} aria-hidden />
                <span className="truncate">{c.title}</span>
                <span className="shrink-0 text-neutral-400">{c.domain}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-400">
        <span>query URL: {promptRun.rawMetadata.queryUrl}</span>
        {promptRun.rawMetadata.screenshotPath && <span>screenshot: {promptRun.rawMetadata.screenshotPath}</span>}
      </div>
    </div>
  );
}

export function CollectionRunsClient({
  runFiles,
  processed,
  brands,
}: {
  runFiles: CollectedRunFile[];
  processed: ProcessedPromptRuns;
  brands: BrandSeed[];
}) {
  const router = useRouter();
  const [analyzingFile, setAnalyzingFile] = useState<CollectedRunFile | null>(null);
  const ownBrand = brands.find((b) => b.isOwnBrand);
  const ownMentions = processed.mentions.filter((m) => m.brandId === ownBrand?.id && m.isPresent);
  const ownCitations = processed.citations.filter((c) => c.isOwnDomain);
  const columns = runColumns((file) => setAnalyzingFile(file));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">수집 로그</h1>
        <p className="mt-1 text-sm text-neutral-500">
          `npm run collect:naver-ai` / `collect:google-ai`가 실제로 저장한 파일(.tmp/naver-ai, .tmp/google-ai)을 그대로 나열합니다.
        </p>
      </div>

      <CollectionRunForm />

      <div className="h-px w-full bg-neutral-200" />

      {runFiles.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
          아직 수집된 파일이 없습니다. 터미널에서 <code>npm run collect:naver-ai -- --query &quot;네오다임&quot;</code>을 실행해보세요.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SimpleStatCard label="수집 실행 수" value={runFiles.length} tooltip="지금까지 저장된 수집 실행 파일 수입니다." />
            <SimpleStatCard
              label="성공한 실행"
              value={runFiles.filter((f) => f.promptRun.status === "success" && !isBotBlocked(f.promptRun)).length}
              tooltip="봇 차단 없이 실제 답변 텍스트를 얻은 실행 수입니다."
            />
            <SimpleStatCard label="브랜드 언급" value={ownMentions.length} tooltip="수집된 답변 중 우리 브랜드가 언급된 횟수입니다." />
            <SimpleStatCard label="브랜드 인용" value={ownCitations.length} tooltip="수집된 답변이 우리 도메인을 인용한 횟수입니다." />
          </div>

          <TablePanel
            title="수집 실행 목록"
            description="행을 클릭하면 저장된 원문과 인용 소스를 볼 수 있습니다."
            count={runFiles.length}
            total={runFiles.length}
          >
            <DataTable
              columns={columns}
              rows={runFiles}
              getRowId={(f) => `${f.dir}/${f.filename}`}
              renderExpanded={(f) => <RunDetail file={f} />}
            />
          </TablePanel>

          <InfoBanner
            title="이 원문·인용 데이터가 다음 LLM 분석 단계의 입력입니다"
            description="브랜드 언급/인용은 이미 이 페이지에서 실시간으로 계산됩니다. 다음 단계는 이 결과를 LLM에 전달해 프롬프트 전략과 기회를 자동 제안하는 것입니다."
            actionLabel="프롬프트 전략에서 확인"
            onAction={() => router.push("/prompt-strategy")}
          />
        </>
      )}

      <Modal open={analyzingFile !== null} onClose={() => setAnalyzingFile(null)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">분석 기능은 개발 진행 중입니다</h2>
            <p className="mt-1 text-sm text-neutral-500">
              LLM을 붙여 프롬프트 전략/기회를 자동 제안하거나 수동으로 분석하는 기능이 이 자리에 추가될 예정입니다.
            </p>
          </div>
          <ModalCloseButton onClose={() => setAnalyzingFile(null)} />
        </div>
      </Modal>
    </div>
  );
}
