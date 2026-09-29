import { TrendResult, TrendTimeUnit } from "@/lib/searchTrend";

export interface TrendGroupInput {
  groupName: string;
  keywords: string[];
}

export interface TrendQuery {
  startDate: string;
  endDate: string;
  timeUnit: TrendTimeUnit;
  keywordGroups: TrendGroupInput[];
  device?: "pc" | "mo";
  gender?: "m" | "f";
  ages?: string[];
}

export type TrendFetchResult = { ok: true; result: TrendResult } | { ok: false; error: string };

// /api/naver-datalab 프록시 호출 — API 응답의 results[].title을 화면 공통 shape의 groupName으로 옮긴다.
export async function fetchTrend(query: TrendQuery): Promise<TrendFetchResult> {
  try {
    const res = await fetch("/api/naver-datalab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      result?: { startDate: string; endDate: string; timeUnit: TrendTimeUnit; results: { title: string; keywords: string[]; data: { period: string; ratio: number }[] }[] };
    } | null;
    if (!res.ok || !body?.result) return { ok: false, error: body?.error ?? "검색어 트렌드를 불러오지 못했습니다." };
    return {
      ok: true,
      result: {
        startDate: body.result.startDate,
        endDate: body.result.endDate,
        timeUnit: body.result.timeUnit,
        series: body.result.results.map((r) => ({ groupName: r.title, keywords: r.keywords, data: r.data })),
      },
    };
  } catch {
    return { ok: false, error: "네트워크 오류로 검색어 트렌드를 불러오지 못했습니다." };
  }
}

export const SERIES_COLORS = ["#1e293b", "#3b82f6", "#fa7317", "#22c55e", "#a855f7", "#e02699"];
