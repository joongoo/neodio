import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";

// /{조직} — 그 조직의 첫 브랜드로 보낸다(브랜드가 없으면 /{조직}/- 에서 브랜드를 등록하게).
// 없는 조직이면 getCurrentTenant가 404를 낸다.
export const dynamic = "force-dynamic";

export default async function OrgRootPage() {
  const tenant = await getCurrentTenant();
  redirect(tenant.brandSlug === "-" ? `${tenant.base}/brands-management` : tenant.base);
}
