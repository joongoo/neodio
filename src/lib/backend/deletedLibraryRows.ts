import { getPromptStore } from "./database";

export async function getDeletedLibraryRowIds(orgId: string): Promise<Set<string>> {
  const store = await getPromptStore();
  const rows = await store.query<{ id: string }>("SELECT id FROM prompt_tracking WHERE organization_id=$1 AND status<>'active'", [orgId]);
  return new Set(rows.map(row => row.id));
}

export async function markLibraryRowDeleted(orgId: string, rowId: string): Promise<void> {
  await (await getPromptStore()).setTrackingStatus(orgId, rowId, "archived");
}
