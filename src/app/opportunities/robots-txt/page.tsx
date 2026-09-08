import { RobotsTxtClient } from "@/components/opportunities/RobotsTxtClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";
import { getRealRobotsTxtOpportunity } from "@/lib/backend/robotsTxtReader";
import { isDemoMode } from "@/lib/backend/demoMode";

// robots.txt는 매번 fetch해서 최신 내용을 보여줘야 한다.
export const dynamic = "force-dynamic";

// Matches Figma "Opportunity Detail - Technical Diagnostic (Template B,
// Merged)" (node 646:14937) — robots.txt read directly, no 3rd-party data
// (neodigm_p0_scope.md §2). "Demo" 브랜드에서는 mock을 그대로 보여준다.
export default async function RobotsTxtOpportunityPage() {
  const demo = await isDemoMode();
  const [org, mock] = await Promise.all([
    db.organizations.get(DEFAULT_ORG_ID),
    db.opportunities.getRobotsTxt(DEFAULT_ORG_ID),
  ]);

  const data = demo ? mock : (await getRealRobotsTxtOpportunity(org.domain)) ?? mock;
  if (!data) return null;

  return <RobotsTxtClient data={data} />;
}
