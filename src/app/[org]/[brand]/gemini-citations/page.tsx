import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/backend/tenant";
import { citationRedirect } from "@/lib/citationNavigation";

export default async function CitationRedirectPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await getCurrentTenant();
  redirect(citationRedirect(tenant.base, "gemini", await searchParams));
}