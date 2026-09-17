"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { CreateCategoryModal, EditCategoryModal, DeleteCategoryModal } from "@/components/brands-management/CategoryModals";
import { AddBrandWizardModal } from "@/components/brands-management/AddBrandWizardModal";
import { BrandsManagementData, ManagedBrand, ManagedCategory } from "@/lib/db";

// 브랜드 추가/삭제는 실 파일 저장소(brandsManagementStore.ts)에 반영된다 —
// 상태 전환(활성 ↔ 대기)과 편집은 브랜드 상세 페이지(BrandDetailClient)에서
// 처리하므로 여기서는 목록 새로고침(router.refresh)만 하면 최신 상태가
// 그대로 반영된다.
export function BrandsManagementClient({ initial }: { initial: BrandsManagementData }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial.categories);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [addBrandSaving, setAddBrandSaving] = useState(false);
  const [deletingBrand, setDeletingBrand] = useState<ManagedBrand | null>(null);
  const [deletingBrandBusy, setDeletingBrandBusy] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ManagedCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ManagedCategory | null>(null);

  async function changeCategory(method: "POST" | "PATCH" | "DELETE", id?: string, name?: string) {
    try {
      const res = await fetch(`/api/categories${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
        method, headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify({ id, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCategories(data.categories);
      router.refresh();
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "카테고리를 저장하지 못했습니다.");
      return false;
    }
  }

  const brands = initial.brands;
  const activeBrands = brands.filter((b) => b.status === "active");
  const pendingBrands = brands.filter((b) => b.status === "pending");

  async function addBrand(brand: Omit<ManagedBrand, "id" | "organizationId">) {
    setAddBrandSaving(true);
    try {
      const res = await fetch("/api/brands-management/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        window.alert(body?.error ?? "브랜드를 추가하지 못했습니다.");
        return;
      }
      router.refresh();
    } finally {
      setAddBrandSaving(false);
    }
  }

  async function confirmDeleteBrand() {
    if (!deletingBrand) return;
    setDeletingBrandBusy(true);
    try {
      const res = await fetch(`/api/brands-management/brands/${deletingBrand.id}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert("브랜드를 삭제하지 못했습니다.");
        return;
      }
      setDeletingBrand(null);
      router.refresh();
    } finally {
      setDeletingBrandBusy(false);
    }
  }

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
            <BrandCard key={brand.id} brand={brand} onDelete={() => setDeletingBrand(brand)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-base font-bold text-neutral-900">대기 중인 브랜드</h2>
        <p className="mt-0.5 text-xs text-neutral-500">도메인 온보딩이 완료되면 자동으로 활성 브랜드로 전환됩니다.</p>
        <div className="mt-3 flex flex-col gap-3">
          {pendingBrands.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-200 p-5 text-center text-xs text-neutral-400">
              대기 중인 브랜드가 없습니다.
            </p>
          ) : (
            pendingBrands.map((brand) => (
              <BrandCard key={brand.id} brand={brand} onDelete={() => setDeletingBrand(brand)} />
            ))
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">카테고리</h2>
          <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setCreateCategoryOpen(true)}>
            카테고리 생성
          </Button>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 border-b border-neutral-100 px-3 py-3 text-xs font-semibold text-neutral-500 sm:grid-cols-[minmax(0,1fr)_100px_80px_80px] sm:gap-3 sm:px-5">
            <span>이름</span>
            <span className="text-right">프롬프트 수</span>
            <span className="hidden text-right sm:block">출처</span>
            <span className="text-right">액션</span>
          </div>
          {categories.map((cat) => {
            const expanded = expandedCategories.has(cat.id);
            const topics = cat.topics ?? [];
            return (
            <div key={cat.id} className="border-b border-neutral-100 text-sm last:border-b-0">
              <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_100px_80px_80px] sm:gap-3 sm:px-5">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`category-topics-${cat.id}`}
                aria-label={`${cat.name} 토픽 ${expanded ? "접기" : "펼치기"}`}
                onClick={() => setExpandedCategories(previous => {
                  const next = new Set(previous);
                  if (next.has(cat.id)) next.delete(cat.id);
                  else next.add(cat.id);
                  return next;
                })}
                className="flex min-w-0 items-center gap-2 rounded py-2 text-left text-neutral-800 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <ChevronRight size={16} aria-hidden="true" className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
                <span className="min-w-0 break-words">{cat.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">({topics.length})</span>
              </button>
              <span className="text-right tabular-nums text-neutral-600">{cat.promptCount}</span>
              <span className="hidden text-right text-neutral-400 sm:block">{cat.origin === "system" ? "—" : "직접 생성"}</span>
              <span className="flex justify-end">
                <button
                  type="button"
                  aria-label={`${cat.name} 편집`}
                  title="카테고리 편집"
                  onClick={() => setEditingCategory(cat)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`${cat.name} 삭제`}
                  title="카테고리 삭제"
                  onClick={() => setDeletingCategory(cat)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-neutral-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </span>
              </div>
              <div id={`category-topics-${cat.id}`} hidden={!expanded}>
                <ul aria-label={`${cat.name} 토픽`} className="border-t border-neutral-100 bg-neutral-50/70 py-1">
                  {topics.map(topic => (
                    <li key={topic.id} className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_100px_80px_80px] sm:gap-3 sm:px-5">
                      <span className="min-w-0 break-words pl-6 text-neutral-600">{topic.name}</span>
                      <span aria-label={`프롬프트 ${topic.promptCount}개`} className="text-right text-xs tabular-nums text-neutral-500">{topic.promptCount}</span>
                    </li>
                  ))}
                  {topics.length === 0 && (
                    <li className="px-9 py-3 text-xs text-neutral-400 sm:px-11">등록된 토픽이 없습니다.</li>
                  )}
                </ul>
              </div>
            </div>
            );
          })}
        </div>
      </section>

      <AddBrandWizardModal open={addBrandOpen} onClose={() => setAddBrandOpen(false)} onAdd={addBrand} saving={addBrandSaving} />
      <Modal open={deletingBrand !== null} onClose={() => setDeletingBrand(null)}>
        {deletingBrand && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-900">브랜드 삭제</h2>
              <ModalCloseButton onClose={() => setDeletingBrand(null)} />
            </div>
            <p className="mt-3 text-sm text-neutral-600">
              <b>{deletingBrand.name}</b>을(를) 삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingBrand(null)}>
                취소
              </Button>
              <button
                type="button"
                disabled={deletingBrandBusy}
                onClick={confirmDeleteBrand}
                className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white cursor-pointer hover:bg-red-700 disabled:cursor-default disabled:bg-neutral-300"
              >
                삭제
              </button>
            </div>
          </>
        )}
      </Modal>
      <CreateCategoryModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onCreate={(name) => changeCategory("POST", undefined, name)}
      />
      <EditCategoryModal
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSave={(id, name) => changeCategory("PATCH", id, name)}
      />
      <DeleteCategoryModal
        category={deletingCategory}
        onClose={() => setDeletingCategory(null)}
        onDelete={(id) => changeCategory("DELETE", id)}
      />
    </div>
  );
}

function BrandCard({ brand, onDelete }: { brand: ManagedBrand; onDelete: () => void }) {
  return (
    <a href={`/brands-management/${brand.id}`} className="block">
      <Card className="flex flex-col gap-3 p-5 transition-colors hover:bg-neutral-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-neutral-900">{brand.name}</h3>
            <p className="text-xs text-neutral-500">{brand.url}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                brand.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {brand.status === "active" ? "활성" : "대기 중"}
            </span>
            <button
              type="button"
              aria-label={`${brand.name} 삭제`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="text-neutral-400 hover:text-red-600 cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
          </div>
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
