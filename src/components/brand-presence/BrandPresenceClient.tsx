"use client";

import { useMemo, useState } from "react";
import { Share2, Settings } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { ChartPanel } from "@/components/overview/ChartPanel";
import { StatCard } from "@/components/overview/StatCard";
import { DataTable, DataTableColumn } from "@/components/ui/DataTable";
import { ConfigureColumnsModal, ColumnOption } from "@/components/ui/ConfigureColumnsModal";
import { useColumnVisibility } from "@/lib/useColumnVisibility";
import { SentimentChart } from "@/components/charts/SentimentChart";
import { MultiLineChart } from "@/components/charts/MultiLineChart";
import { BrandPresenceDetailsModal } from "@/components/brand-presence/BrandPresenceDetailsModal";
import { downloadCsv } from "@/lib/csv";
import {
  BrandPresenceData,
  DataInsightRow,
  Sentiment,
  SentimentMoverRow,
  ShareOfVoiceRow,
  StatCard as StatCardData,
} from "@/lib/db";

const MARKET_OPTIONS = ["전체", "KR", "US", "GLOBAL"];
const MODEL_OPTIONS = ["전체", "ChatGPT", "Gemini", "Claude", "Perplexity", "Naver AI검색", "Google AI Overview"];
const MAX_COMPETITORS = 5;

const SENTIMENT_LABEL: Record<Sentiment, string> = { positive: "긍정", neutral: "중립", negative: "부정" };
const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: "text-emerald-600",
  neutral: "text-neutral-500",
  negative: "text-red-600",
};

export function BrandPresenceClient({
  statCards,
  data,
}: {
  statCards: StatCardData[];
  data: BrandPresenceData;
}) {
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<string[]>(data.defaultSelectedCompetitors);
  const [detailRow, setDetailRow] = useState<DataInsightRow | null>(null);

  // 상단 마켓/모델 드롭다운이 실제로 아무 테이블에도 적용 안 되고 있었음
  // (마켓 트래킹 카드만 "상단 필터의 영향을 받지 않습니다"라고 명시돼 있고,
  // 나머지는 영향을 받아야 하는데 실제로는 다 무시됐던 버그). 데이터
  // 인사이트/무버 테이블에 있는 필드 기준으로 실제로 걸러지도록 수정 —
  // Share of Voice는 market/source 필드 자체가 없어 구조적으로 필터링
  // 불가능하니 그대로 둔다.
  const dataInsights = useMemo(
    () => data.dataInsights.filter((r) => model === "전체" || r.source === model),
    [data.dataInsights, model]
  );
  const topMovers = useMemo(
    () => data.topMovers.filter((r) => (market === "전체" || r.market === market) && (model === "전체" || r.source === model)),
    [data.topMovers, market, model]
  );
  const bottomMovers = useMemo(
    () => data.bottomMovers.filter((r) => (market === "전체" || r.market === market) && (model === "전체" || r.source === model)),
    [data.bottomMovers, market, model]
  );

  function exportShareOfVoiceCsv() {
    downloadCsv(
      "share-of-voice.csv",
      ["topic", "popularity", "mentions", "rank", "sharePercent", "topBrands"],
      data.shareOfVoice.map((r) => [
        r.topic,
        String(r.popularity),
        String(r.mentions),
        String(r.rank),
        String(r.sharePercent),
        r.topBrands.map((b) => `${b.brand} ${b.share}%`).join("; "),
      ])
    );
  }

  function toggleCompetitor(brand: string) {
    setSelectedCompetitors((prev) => {
      if (prev.includes(brand)) return prev.filter((b) => b !== brand);
      if (prev.length >= MAX_COMPETITORS) return prev;
      return [...prev, brand];
    });
  }

  const insightColumns: DataTableColumn<DataInsightRow>[] = useMemo(
    () => [
      { key: "topic", label: "토픽", width: "w-[220px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
      { key: "source", label: "출처", width: "w-[100px]", render: (r) => <span className="text-neutral-500">{r.source}</span> },
      { key: "popularity", label: "인기도", width: "w-[80px]", render: (r) => r.popularity },
      { key: "visibilityScore", label: "가시성 점수", width: "w-[100px]", render: (r) => `${r.visibilityScore}%` },
      { key: "mentions", label: "언급 수", width: "w-[90px]", render: (r) => r.mentions },
      {
        key: "sentiment",
        label: "감성",
        width: "w-[70px]",
        render: (r) => <span className={SENTIMENT_COLOR[r.sentiment]}>{SENTIMENT_LABEL[r.sentiment]}</span>,
      },
      { key: "totalCitations", label: "전체 인용 수", width: "w-[90px]", render: (r) => r.totalCitations },
      { key: "ownCitations", label: "자사 인용 수", width: "w-[90px]", render: (r) => r.ownCitations },
      {
        key: "action",
        label: "액션",
        width: "w-[80px]",
        render: (r) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailRow(r);
            }}
            className="rounded border-[1.5px] border-slate-800 px-2 py-1 text-[11px] font-bold text-slate-800 cursor-pointer hover:bg-slate-50"
          >
            상세
          </button>
        ),
      },
    ],
    []
  );

  const moverColumns: DataTableColumn<SentimentMoverRow>[] = [
    { key: "prompt", label: "프롬프트", width: "w-[280px]", render: (r) => <span className="truncate text-neutral-700">{r.prompt}</span> },
    { key: "source", label: "출처", width: "w-[80px]", render: (r) => <span className="text-neutral-500">{r.source}</span> },
    { key: "topic", label: "토픽", width: "w-[160px]", render: (r) => <span className="truncate text-neutral-600">{r.topic}</span> },
    { key: "category", label: "카테고리", width: "w-[90px]", render: (r) => r.category },
    { key: "market", label: "마켓", width: "w-[60px]", render: (r) => r.market },
    { key: "popularity", label: "인기도", width: "w-[70px]", render: (r) => r.popularity },
    {
      key: "trend",
      label: "트렌드",
      width: "w-[140px]",
      render: (r) => (
        <span className="text-xs">
          <span className={SENTIMENT_COLOR[r.fromSentiment]}>{SENTIMENT_LABEL[r.fromSentiment]}</span>
          <span className="mx-1 text-neutral-400">→</span>
          <span className={SENTIMENT_COLOR[r.toSentiment]}>{SENTIMENT_LABEL[r.toSentiment]}</span>
        </span>
      ),
    },
  ];

  const sovColumns: DataTableColumn<ShareOfVoiceRow>[] = [
    { key: "topic", label: "토픽", width: "w-[200px]", render: (r) => <span className="text-neutral-700">{r.topic}</span> },
    { key: "popularity", label: "인기도", width: "w-[80px]", render: (r) => r.popularity },
    { key: "mentions", label: "언급 수", width: "w-[80px]", render: (r) => r.mentions },
    { key: "rank", label: "순위", width: "w-[60px]", render: (r) => `${r.rank}위` },
    { key: "sharePercent", label: "SoV", width: "w-[70px]", render: (r) => `${r.sharePercent}%` },
    {
      key: "topBrands",
      label: "상위 5개 브랜드",
      render: (r) => (
        <span className="text-xs text-neutral-500">
          {r.topBrands
            .slice(0, 3)
            .map((b) => `${b.brand} ${b.share}%`)
            .join(" · ")}
          {r.topBrands.length > 3 && ` +${r.topBrands.length - 3}개 더`}
        </span>
      ),
    },
  ];

  const insightOptional: ColumnOption[] = [
    { key: "source", label: "출처" },
    { key: "popularity", label: "인기도" },
    { key: "visibilityScore", label: "가시성 점수" },
    { key: "mentions", label: "언급 수" },
    { key: "sentiment", label: "감성" },
    { key: "totalCitations", label: "전체 인용 수" },
    { key: "ownCitations", label: "자사 인용 수" },
  ];
  const moverOptional: ColumnOption[] = [
    { key: "source", label: "출처" },
    { key: "topic", label: "토픽" },
    { key: "category", label: "카테고리" },
    { key: "market", label: "마켓" },
    { key: "popularity", label: "인기도" },
    { key: "trend", label: "트렌드" },
  ];
  const sovOptional: ColumnOption[] = [
    { key: "popularity", label: "인기도" },
    { key: "mentions", label: "언급 수" },
    { key: "rank", label: "순위" },
    { key: "sharePercent", label: "SoV" },
    { key: "topBrands", label: "상위 5개 브랜드" },
  ];

  const insight = useColumnVisibility(insightColumns, insightOptional);
  const mover = useColumnVisibility(moverColumns, moverOptional);
  const sov = useColumnVisibility(sovColumns, sovOptional);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-900">브랜드 가시성</h1>
        <div className="flex gap-2">
          <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={setMarket} />
          <Dropdown variant="solid" label="모델" value={model} options={MODEL_OPTIONS} onChange={setModel} />
        </div>
      </div>

      <InfoBanner
        title="브랜드 가시성는 어떻게 동작하나요"
        description="브랜드가 어디서, 얼마나 자주, 어떤 토픽에서 언급되는지 파악하고, 놓친 기회와 최적화 기회를 발견하세요."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900">마켓 트래킹</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            언급 수와 인용 수를 기준으로 선택한 다른 브랜드 대비 우리 브랜드의 성과를 비교합니다. 상단 필터의 영향을 받지 않습니다.
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500">비교 대상 선택</p>
          <div className="flex flex-wrap gap-2">
            {data.allCompetitors.map((brand) => {
              const active = selectedCompetitors.includes(brand);
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => toggleCompetitor(brand)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {brand}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">최대 {MAX_COMPETITORS}개 브랜드까지 선택 가능합니다. 추가하려면 일부를 제거하세요.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">브랜드 언급 수</h3>
            <p className="text-xs text-neutral-500">주간 언급 수 비교</p>
            <MultiLineChart data={data.mentionsByWeek} series={selectedCompetitors} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">브랜드 인용 수</h3>
            <p className="text-xs text-neutral-500">주간 인용 수 비교</p>
            <MultiLineChart data={data.citationsByWeek} series={selectedCompetitors} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel title="감성 분포" description="긍정/중립/부정 감성 비율 분석">
          <SentimentChart data={data.sentimentByWeek} />
        </ChartPanel>
        <ChartPanel title="프롬프트 지표" description="시간 경과에 따른 전체 프롬프트 수와 감성이 감지된 프롬프트 수">
          <MultiLineChart
            data={data.promptMetricsByWeek.map((p) => ({
              week: p.week,
              전체_프롬프트: p.totalPrompts,
              감성_감지_프롬프트: p.sentimentDetectedPrompts,
            }))}
            series={["전체_프롬프트", "감성_감지_프롬프트"]}
          />
        </ChartPanel>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">개선 상위 항목</h2>
            <p className="mt-0.5 text-xs text-neutral-500">감성이 개선된(부정→중립, 부정→긍정, 중립→긍정) 검색량 상위 프롬프트</p>
          </div>
          <GearButton onClick={() => mover.setOpen(true)} />
        </div>
        <div className="mt-4">
          <DataTable columns={mover.filtered} rows={topMovers} getRowId={(r) => r.id} />
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold text-neutral-900">하락 상위 항목</h2>
        <p className="mt-0.5 text-xs text-neutral-500">감성이 하락한(긍정→중립, 긍정→부정, 중립→부정) 검색량 상위 프롬프트</p>
        {bottomMovers.length === 0 ? (
          <p className="mt-4 text-xs text-neutral-400">ⓘ 감지된 감성 변화가 없습니다</p>
        ) : (
          <div className="mt-4">
            <DataTable columns={mover.filtered} rows={bottomMovers} getRowId={(r) => r.id} />
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">데이터 인사이트</h2>
            <p className="mt-0.5 text-xs text-neutral-500">토픽과 사용자 프롬프트를 살펴보고 콘텐츠 영향을 평가·최적화하세요</p>
          </div>
          <GearButton onClick={() => insight.setOpen(true)} />
        </div>
        <div className="mt-4">
          <DataTable columns={insight.filtered} rows={dataInsights} getRowId={(r) => r.id} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">쉐어 오브 보이스(Share of Voice)</h2>
            <p className="mt-0.5 text-xs text-neutral-500">토픽별 브랜드 언급 점유율을 비교해 공백을 파악하고 우선순위를 정하세요</p>
          </div>
          <div className="flex items-center gap-2">
            <GearButton onClick={() => sov.setOpen(true)} />
            <button
              type="button"
              onClick={exportShareOfVoiceCsv}
              className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-200 cursor-pointer"
            >
              <Share2 size={14} />
              내보내기
            </button>
          </div>
        </div>
        <div className="mt-4">
          <DataTable columns={sov.filtered} rows={data.shareOfVoice} getRowId={(r) => r.id} />
        </div>
      </Card>

      <BrandPresenceDetailsModal row={detailRow} onClose={() => setDetailRow(null)} />
      <ConfigureColumnsModal open={insight.open} onClose={() => insight.setOpen(false)} columns={insightOptional} visible={insight.visible} onApply={insight.setVisible} />
      <ConfigureColumnsModal open={mover.open} onClose={() => mover.setOpen(false)} columns={moverOptional} visible={mover.visible} onApply={mover.setVisible} />
      <ConfigureColumnsModal open={sov.open} onClose={() => sov.setOpen(false)} columns={sovOptional} visible={sov.visible} onApply={sov.setVisible} />
    </div>
  );
}

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="컬럼 설정"
      onClick={onClick}
      className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 cursor-pointer"
    >
      <Settings size={16} />
    </button>
  );
}
