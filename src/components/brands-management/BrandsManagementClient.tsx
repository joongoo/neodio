"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CreateCategoryModal, EditCategoryModal, DeleteCategoryModal } from "@/components/brands-management/CategoryModals";
import { AddBrandWizardModal } from "@/components/brands-management/AddBrandWizardModal";
import { BrandsManagementData, ManagedBrand, ManagedCategory } from "@/lib/db";

export function BrandsManagementClient({ initial }: { initial: BrandsManagementData }) {
  const [brands, setBrands] = useState(initial.brands);
  const [categories, setCategories] = useState(initial.categories);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ManagedCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ManagedCategory | null>(null);

  const activeBrands = brands.filter((b) => b.status === "active");
  const pendingBrands = brands.filter((b) => b.status === "pending");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">브랜드 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">조직에서 추적하는 브랜드와 카테고리를 관리하세요.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddBrandOpen(true)}>
          브랜드 추가
        </Button>
      </div>

      <section>
        <h2 className="text-base font-bold text-neutral-900">활성 브랜드</h2>
        <div className="mt-3 flex flex-col gap-3">
          {activeBrands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-neutral-900">대기 중인 브랜드</h2>
        <p className="mt-0.5 text-xs text-neutral-500">도메인 온보딩이 완료되면 자동으로 활성 브랜드로 전환됩니다.</p>
        <div className="mt-3 flex flex-col gap-3">
          {pendingBrands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">카테고리</h2>
          <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreateCategoryOpen(true)}>
            카테고리 생성
          </Button>
        </div>
        <div className="mt-3 rounded-xl border border-neutral-200 bg-white">
          <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-3 text-xs font-semibold text-neutral-500">
            <span className="flex-1">이름</span>
            <span className="w-[100px] text-right">프롬프트 수</span>
            <span className="w-[80px] text-right">출처</span>
            <span className="w-[80px] text-right">액션</span>
          </div>
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 border-b border-neutral-50 px-5 py-3 text-sm last:border-b-0">
              <span className="flex-1 text-neutral-800">{cat.name}</span>
              <span className="w-[100px] text-right text-neutral-600">{cat.promptCount}</span>
              <span className="w-[80px] text-right text-neutral-400">{cat.origin === "system" ? "—" : "직접 생성"}</span>
              <span className="flex w-[80px] justify-end gap-2">
                <button
                  type="button"
                  aria-label="편집"
                  onClick={() => setEditingCategory(cat)}
                  className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  aria-label="삭제"
                  onClick={() => setDeletingCategory(cat)}
                  className="text-neutral-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <AddBrandWizardModal
        open={addBrandOpen}
        onClose={() => setAddBrandOpen(false)}
        onAdd={(brand) => setBrands((prev) => [...prev, { id: `brand-${Date.now()}`, ...brand }])}
      />
      <CreateCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onCreate={(name) =>
          setCategories((prev) => [...prev, { id: `cat-${Date.now()}`, name, promptCount: 0, origin: "user" }])
        }
      />
      <EditCategoryModal
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSave={(id, name) => setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))}
      />
      <DeleteCategoryModal
        category={deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onDelete={(id) => setCategories((prev) => prev.filter((c) => c.id !== id))}
      />
    </div>
  );
}

function BrandCard({ brand }: { brand: ManagedBrand }) {
  return (
    <a href={`/brands-management/${brand.id}`} className="block">
      <Card className="flex flex-col gap-3 p-5 transition-colors hover:bg-neutral-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">{brand.name}</h3>
            <p className="text-xs text-neutral-500">{brand.url}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              brand.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {brand.status === "active" ? "활성" : "대기 중"}
          </span>
        </div>

        {(brand.aliases.length > 0 || brand.otherBrands.length > 0) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
            {brand.aliases.length > 0 && <span>별칭: {brand.aliases.join(", ")}</span>}
            {brand.otherBrands.length > 0 && <span>기타 브랜드: {brand.otherBrands.join(", ")}</span>}
          </div>
        )}

        {brand.status === "active" && (
          <div className="flex gap-4 border-t border-neutral-100 pt-3 text-xs">
            <ConnectionStatus label="CDN" connected={brand.cdnConnected} />
            <ConnectionStatus label="Google Search Console" connected={brand.gscConnected} />
            <ConnectionStatus label="Analytics" connected={brand.analyticsConnected} />
          </div>
        )}
      </Card>
    </a>
  );
}

function ConnectionStatus({ label, connected }: { label: string; connected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${connected ? "text-emerald-700" : "text-neutral-400"}`}>
      {connected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </span>
  );
}
