import { BrandsManagementClient } from "@/components/brands-management/BrandsManagementClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function BrandsManagementPage() {
  const data = await db.brandsManagement.get(DEFAULT_ORG_ID);
  if (!data) return null;

  return <BrandsManagementClient initial={data} />;
}
