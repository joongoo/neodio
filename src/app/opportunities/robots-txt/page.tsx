import { RobotsTxtClient } from "@/components/opportunities/RobotsTxtClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

// Matches Figma "Opportunity Detail - Technical Diagnostic (Template B,
// Merged)" (node 646:14937) — robots.txt read directly, no 3rd-party data
// (neodigm_p0_scope.md §2).
export default async function RobotsTxtOpportunityPage() {
  const data = await db.opportunities.getRobotsTxt(DEFAULT_ORG_ID);
  if (!data) return null;

  return <RobotsTxtClient data={data} />;
}
