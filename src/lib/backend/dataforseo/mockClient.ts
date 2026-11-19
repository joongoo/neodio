import { randomUUID } from "node:crypto";
import { DataForSeoClient } from "./client";
import type { DataForSeoApiResponse } from "./types";

/** Deterministic offline transport; IDs survive a local worker restart. */
export class MockDataForSeoClient extends DataForSeoClient {
  override assertReady(): void {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      throw new Error("DATAFORSEO_MOCK is available only in local development.");
    }
  }

  override async postTasks(_pathname: string, tasks: Record<string, unknown>[]): Promise<DataForSeoApiResponse> {
    this.assertReady();
    if (tasks.length !== 1) throw new Error("Mock submission requires exactly one task.");
    return { status_code: 20000, tasks: [{ id: `mock-${randomUUID()}`, status_code: 20100, cost: 0 }] };
  }

  override async get(pathname: string): Promise<DataForSeoApiResponse> {
    this.assertReady();
    const id = pathname.split("/").at(-1) ?? "";
    if (!id.startsWith("mock-")) throw new Error("Mock mode cannot recover a real provider task.");
    const answer = "[MOCK 테스트 데이터] 실제 검색 결과가 아닙니다.";
    const payload = {
      refs: { blockId: "ai-briefing/prs_template_aib_answer_desk.ts" },
      body: { props: { summary: { markdown: answer }, sources: [{ title: "Mock source", url: "https://example.com/mock" }] } },
    };
    return {
      status_code: 20000,
      tasks: [{ id, status_code: 20000, cost: 0, result: [pathname.includes("/naver/")
        ? { items: [{ html: `<html><body>AI 브리핑<script>window.__mock=${JSON.stringify(payload)}</script></body></html>` }] }
        : { items: [{ type: "ai_overview", markdown: answer, references: [{ title: "Mock source", url: "https://example.com/mock" }] }] }],
      }],
    };
  }
}
