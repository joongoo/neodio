import { BrandDetailClient } from "@/components/brands-management/BrandDetailClient";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const brand = await db.brandsManagement.getBrand(DEFAULT_ORG_ID, brandId);
  if (!brand) return null;

  return <BrandDetailClient initial={brand} />;
}
