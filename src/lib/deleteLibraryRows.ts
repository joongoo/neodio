// Stop on the first failure so a DB outage does not trigger hundreds of requests.
export async function deleteLibraryRows(
  ids: string[],
  onDeleted: (id: string, completed: number) => void,
  request: typeof fetch = fetch,
) {
  for (let index = 0; index < ids.length; index++) {
    const response = await request(`/api/tracked-topics?id=${encodeURIComponent(ids[index])}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error ?? "삭제 요청에 실패했습니다.");
    onDeleted(ids[index], index + 1);
  }
}
