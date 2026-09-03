import { ContentRecoveryClient } from "@/components/opportunities/ContentRecoveryClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

// Matches Figma "Opportunity Detail - Content Recovery (Template C)" (node
// 646:15046). Content-visibility scoring comes from our own Playwright
// crawl (rendered vs raw HTML), no 3rd-party data (neodigm_p0_scope.md §2).
export default async function ContentRecoveryOpportunityPage() {
  const data = await db.opportunities.getContentRecovery(DEFAULT_ORG_ID);
  if (!data) return null;

  return <ContentRecoveryClient data={data} />;
}
