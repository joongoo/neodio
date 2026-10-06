"use client";

import { useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { FilterDropdown } from "@/components/overview/FilterDropdown";
import { MARKET_FILTER_OPTIONS, MODEL_FILTER_OPTIONS, QUERY_SCOPE_OPTIONS } from "@/lib/filterOptionLabels";
import type { BrandOptimizationContext } from "@/components/visibility-overview/TopicsTableSection";
import { StatCard } from "@/components/overview/StatCard";
import { RangeDropdown } from "@/components/overview/RangeDropdown";
import { RankedBarList } from "@/components/overview/RankedBarList";
import { TopicsTableSection } from "@/components/visibility-overview/TopicsTableSection";
import {
  DateRange,
  Organization,
  RankedRow,
  StatCard as StatCardData,
  TopicCategory,
  VisibilityTableRow,
} from "@/lib/db";

const MODEL_TABS = [
  { id: "mentions", label: "언급 수" },
  { id: "visibility", label: "가시성" },
  { id: "exposure", label: "노출" },
];


function hasMarket(row: VisibilityTableRow): row is Extract<VisibilityTableRow, { market: string }> {
  return "market" in row;
}

function hasPrompts(row: VisibilityTableRow): row is Extract<VisibilityTableRow, { prompts: { model: string }[] }> {
  // CitedSourceRow also has a `prompts` key, but it's a count (number), not
  // a list — check it's actually an array so that shape isn't misidentified.
  return "prompts" in row && Array.isArray(row.prompts);
}

export function VisibilityOverviewClient({
  org,
  range,
  statCards,
  mentionsByModel,
  mentionsByMarket,
  categories,
  topicsByCategory,
  sourceOpportunityDomains,
  brandContext,
  marketLabel,
  modelLabel,
  queryScopeLabel,
  serverFiltered,
}: {
  org: Organization;
  range: DateRange;
  statCards: StatCardData[];
  mentionsByModel: Record<string, RankedRow[]>;
  mentionsByMarket: Record<string, RankedRow[]>;
  categories: TopicCategory[];
  topicsByCategory: Record<string, VisibilityTableRow[]>;
  /** 있으면 "소스 기회" 행은 "인용된 소스" 행에서 이 도메인 순서대로 다시 만든다(같은 행을 두 번 보내지 않으려고). */
  sourceOpportunityDomains?: string[];
  /** 브랜드 최적화(AI 브랜드 정리)가 쓰는 자사·등록 경쟁사 정보. 브랜드가 없으면 null. */
  brandContext: BrandOptimizationContext | null;
  /** 상단 필터 값 — 주소(쿼리)에 두고, 실 데이터는 서버가 같은 값으로 다시 계산한다. */
  marketLabel: string;
  modelLabel: string;
  queryScopeLabel: string;
  /** true면 카드·표가 이미 서버에서 필터링돼 있다. false(샘플 데이터)면 아래에서 표를 직접 거른다. */
  serverFiltered: boolean;
}) {
  const market = serverFiltered ? "전체" : marketLabel;
  const model = serverFiltered ? "전체" : modelLabel;

  const filteredTopicsByCategory = useMemo(() => {
    const result: Record<string, VisibilityTableRow[]> = {};
    const resolved: Record<string, VisibilityTableRow[]> = { ...topicsByCategory };
    if (sourceOpportunityDomains) {
      const byDomain = new Map((topicsByCategory["cited-sources"] ?? []).map((row) => [(row as { domain: string }).domain, row]));
      resolved["source-opportunities"] = sourceOpportunityDomains.flatMap((domain) => byDomain.get(domain) ?? []);
    }
    for (const [categoryId, rows] of Object.entries(resolved)) {
      result[categoryId] = rows.filter((row) => {
        const marketOk = market === "전체" || !hasMarket(row) || row.market === market;
        const modelOk = model === "전체" || !hasPrompts(row) || row.prompts.some((p) => p.model === model);
        return marketOk && modelOk;
      });
    }
    return result;
  }, [topicsByCategory, sourceOpportunityDomains, market, model]);

  const filteredCategories = categories.map((c) => ({
    ...c,
    badge: filteredTopicsByCategory[c.id]?.length ?? c.badge,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">가시성 개요</h1>
        <p className="mt-1 text-sm text-neutral-500">선택한 도메인의 AI 가시성 지표와 테이블을 확인하세요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <RangeDropdown value={range} variant="solid" label="기간" />
          <Dropdown variant="solid" label="" value={org.domain} options={[org.domain]} />
          <FilterDropdown label="마켓" paramKey="market" value={marketLabel} options={MARKET_FILTER_OPTIONS} variant="solid" />
          <FilterDropdown label="모델" paramKey="model" value={modelLabel} options={MODEL_FILTER_OPTIONS} variant="solid" />
          <FilterDropdown label="질의" paramKey="scope" value={queryScopeLabel} options={QUERY_SCOPE_OPTIONS} variant="solid" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedBarList panelTitle="Mentions by Model" listTitle="모델별 언급 수" tabs={MODEL_TABS} data={mentionsByModel} />
        <RankedBarList panelTitle="Mentions by Market" listTitle="마켓별 언급 수" tabs={MODEL_TABS} data={mentionsByMarket} />
      </div>

      <TopicsTableSection
        categories={filteredCategories}
        topicsByCategory={filteredTopicsByCategory}
        brandContext={brandContext}
        range={range}
      />
    </div>
  );
}
