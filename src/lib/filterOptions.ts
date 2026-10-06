import { seedLlmModels, seedMarkets } from "@/lib/db/data/seed";
import type { DateRange } from "@/lib/db";
import type { QueryScope } from "@/lib/queryScope";

// 가시성 개요·브랜드 가시성의 상단 필터(기간·마켓·모델·질의 유형) — 화면의 선택값(라벨)과 서버 필터(id)를 잇는다.
// 선택값은 주소(쿼리)에 두어 서버가 같은 필터로 모든 표·카드를 다시 계산한다.

export { MARKET_FILTER_OPTIONS, MODEL_FILTER_OPTIONS, QUERY_SCOPE_OPTIONS } from "@/lib/filterOptionLabels";
const SCOPE_BY_LABEL: Record<string, QueryScope> = { "브랜드 질의": "brand", "일반 질의": "nonbrand" };
const VALID_RANGES: DateRange[] = ["1w", "2w", "4w"];

export interface ParsedFilters {
  range: DateRange;
  /** 화면에 보일 선택값(알 수 없는 값은 "전체"로 되돌린다). */
  marketLabel: string;
  modelLabel: string;
  scopeLabel: string;
  /** 서버 필터 — 선택 안 한 항목은 키 자체가 없다. */
  filters: { marketId?: string; llmModelId?: string; queryScope?: QueryScope };
}

export function parseFilters(params: { range?: string; market?: string; model?: string; scope?: string }): ParsedFilters {
  const range = VALID_RANGES.includes(params.range as DateRange) ? (params.range as DateRange) : "4w";
  const market = params.market ? seedMarkets.find((m) => m.code === params.market) : undefined;
  const model = params.model ? seedLlmModels.find((m) => m.name === params.model) : undefined;
  const queryScope = params.scope ? SCOPE_BY_LABEL[params.scope] : undefined;
  return {
    range,
    marketLabel: market ? market.code : "전체",
    modelLabel: model ? model.name : "전체",
    scopeLabel: queryScope ? (params.scope as string) : "전체",
    filters: {
      ...(market ? { marketId: market.id } : {}),
      ...(model ? { llmModelId: model.id } : {}),
      ...(queryScope ? { queryScope } : {}),
    },
  };
}
