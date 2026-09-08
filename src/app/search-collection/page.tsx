import { SearchCollectionClient } from "@/components/search-collection/SearchCollectionClient";
import { db } from "@/lib/db";

const DEFAULT_KEYWORD = "네오다임";

export default async function SearchCollectionPage() {
  const initialResult = await db.searchCollection.search(DEFAULT_KEYWORD);

  return <SearchCollectionClient initialKeyword={DEFAULT_KEYWORD} initialResult={initialResult} />;
}
