import { ArrowLeft } from "lucide-react";
import { GscConnectionCard } from "@/components/brands-management/GscConnectionCard";
import { DEFAULT_ORG_ID, db } from "@/lib/db";

export default async function BrandConnectionsPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const [brand, gsc] = await Promise.all([
    db.brandsManagement.getBrand(DEFAULT_ORG_ID, brandId),
    db.connections.getGsc(brandId),
  ]);
  if (!brand) return null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <a href={`/brands-management/${brand.id}`} className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        {brand.name}(으)로 돌아가기
      </a>
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">연결 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          <b>{brand.name}</b>의 Google Search Console 연동 상태를 확인하세요.
        </p>
      </div>

      <GscConnectionCard gsc={gsc} />
    </div>
  );
}
