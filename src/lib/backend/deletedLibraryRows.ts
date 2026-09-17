import { getPromptStore } from "./database";

export async function getDeletedLibraryRowIds(orgId: string): Promise<Set<string>> {
  const store = await getPromptStore();
  const rows = store.sql.prepare("SELECT id FROM prompt_tracking WHERE organization_id=? AND status<>'active'").all(orgId);
  return new Set(rows.map(row => row.id as string));
}

export async function markLibraryRowDeleted(orgId: string, rowId: string): Promise<void> {
  (await getPromptStore()).setTrackingStatus(orgId, rowId, "archived");
}
