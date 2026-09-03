"use client";

import { useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
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

const MARKET_OPTIONS = ["전체", "KR", "US", "GLOBAL"];
const MODEL_OPTIONS = ["전체", "ChatGPT", "Gemini", "Claude", "Perplexity", "Naver AI검색", "Google AI Overview"];

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
}: {
  org: Organization;
  range: DateRange;
  statCards: StatCardData[];
  mentionsByModel: Record<string, RankedRow[]>;
  mentionsByMarket: Record<string, RankedRow[]>;
  categories: TopicCategory[];
  topicsByCategory: Record<string, VisibilityTableRow[]>;
}) {
  const [market, setMarket] = useState("전체");
  const [model, setModel] = useState("전체");

  const filteredTopicsByCategory = useMemo(() => {
    const result: Record<string, VisibilityTableRow[]> = {};
    for (const [categoryId, rows] of Object.entries(topicsByCategory)) {
      result[categoryId] = rows.filter((row) => {
        const marketOk = market === "전체" || !hasMarket(row) || row.market === market;
        const modelOk = model === "전체" || !hasPrompts(row) || row.prompts.some((p) => p.model === model);
        return marketOk && modelOk;
      });
    }
    return result;
  }, [topicsByCategory, market, model]);

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
          <Dropdown variant="solid" label="마켓" value={market} options={MARKET_OPTIONS} onChange={setMarket} />
          <Dropdown variant="solid" label="모델" value={model} options={MODEL_OPTIONS} onChange={setModel} />
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

      <TopicsTableSection categories={filteredCategories} topicsByCategory={filteredTopicsByCategory} />
    </div>
  );
}
