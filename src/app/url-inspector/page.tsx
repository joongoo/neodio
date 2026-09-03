import { UrlInspectorClient } from "@/components/url-inspector/UrlInspectorClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function UrlInspectorPage() {
  const data = await db.urlInspector.get(DEFAULT_ORG_ID);
  if (!data) return null;

  return <UrlInspectorClient data={data} />;
}
