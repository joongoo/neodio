import Link from "next/link";
import { listRequestLogs, parseRequestLogOptions, RequestLogInputError } from "@/lib/backend/dataforseo/requestLog";
import { getRequestAttentionCount } from "@/lib/backend/dataforseo/collectionActivity";
import { RequestLogClient } from "./RequestLogClient";

export async function RequestLogList({ base, organizationId, brandId, query }: { base: string; organizationId: string; brandId: string; query: URLSearchParams }) {
  const path = `${base}/collection-runs`;
  query.delete("q");
  let options;
  try { options = parseRequestLogOptions(query); }
  catch (error) {
    if (!(error instanceof RequestLogInputError)) throw error;
    return <div role="alert" className="p-6">{error.message} <Link href={path}>필터 초기화</Link></div>;
  }
  const [data, attentionCount] = await Promise.all([listRequestLogs(organizationId, brandId, options), getRequestAttentionCount(organizationId, brandId)]);
  return <RequestLogClient path={path} initial={{ ...data, attentionCount }} initialQuery={query.toString()} />;
}
