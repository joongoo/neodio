import type { PromptSurface } from "./promptSurfaces";

export async function updateLibrarySurfaces(
  ids: string[],
  surfaces: PromptSurface[],
  onSaved: (ids: string[]) => void,
  request: typeof fetch = fetch,
) {
  const uniqueIds = [...new Set(ids)];
  for (let offset = 0; offset < uniqueIds.length; offset += 25) {
    const batch = uniqueIds.slice(offset, offset + 25);
    const response = await request("/api/tracked-topics/surfaces", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: batch, surfaces }),
    });
    const body = await response.json().catch(() => ({}));
    const changedIds = Array.isArray(body.ids) ? batch.filter(id => body.ids.includes(id)) : [];
    if (changedIds.length) onSaved(changedIds);
    if (!response.ok || changedIds.length !== batch.length) {
      throw new Error(body.error ?? "일부 프롬프트의 플랫폼을 바꾸지 못했습니다. 변경된 항목은 유지됩니다. 다시 시도해 주세요.");
    }
  }
}
