import { loadSidebarActivity } from "@/lib/backend/dataforseo/sidebarActivity";
import { CollectionActivityIndicator } from "./CollectionActivityIndicator";

export async function CollectionActivitySlot({ orgId, brandId, load = loadSidebarActivity }: { orgId: string; brandId: string | null; load?: typeof loadSidebarActivity }) {
  return <CollectionActivityIndicator state={await load(orgId, brandId)} />;
}
