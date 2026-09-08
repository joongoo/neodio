import { SearchTrendClient } from "@/components/search-trend/SearchTrendClient";
import { db } from "@/lib/db";

const DEFAULT_KEYWORD = "네오다임";

export default async function SearchTrendPage() {
  const initialResult = await db.searchTrend.search(DEFAULT_KEYWORD);

  return <SearchTrendClient initialKeyword={DEFAULT_KEYWORD} initialResult={initialResult} />;
}
