import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";

// "/" — 마지막으로 본 조직·브랜드(없으면 기본 조직)로 보낸다. 예전 주소에서
// 넘어온 경우(?next=/youtube-aio 등) 그 화면으로 이어서 보낸다(src/proxy.ts).
export const dynamic = "force-dynamic";

export default async function RootPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [tenant, { next }] = await Promise.all([getCurrentTenant(), searchParams]);
  // 같은 사이트 안의 경로만 허용(//evil.com 같은 외부 주소로 보내지 않게).
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  redirect(`${tenant.base}${path}`);
}
