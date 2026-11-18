import type { PromptLibraryRow } from "./db/types";

export interface CsvPrompt { prompt: string; category: string; topic: string }

// One small batch at a time, including when a CSV contains hundreds of rows.
export async function importPromptCsv(
  rows: CsvPrompt[],
  onSaved: (rows: PromptLibraryRow[]) => void,
  request: typeof fetch = fetch,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 25) {
    const response = await request("/api/tracked-topics/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: rows.slice(offset, offset + 25) }),
    });
    const body = await response.json().catch(() => ({}));
    if (Array.isArray(body.rows)) onSaved(body.rows);
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "가져오기에 실패했습니다. 저장된 항목은 유지됩니다. 다시 시도해 주세요.");
    }
  }
}
