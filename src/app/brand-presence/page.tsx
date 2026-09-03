import { BrandPresenceClient } from "@/components/brand-presence/BrandPresenceClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function BrandPresencePage() {
  const [statCards, data] = await Promise.all([
    db.brandPresence.getStatCards(DEFAULT_ORG_ID),
    db.brandPresence.get(DEFAULT_ORG_ID),
  ]);

  if (!data) return null;

  return <BrandPresenceClient statCards={statCards} data={data} />;
}
