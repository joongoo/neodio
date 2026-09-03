"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, Link2, Share2, FileText, Tag } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import { ManagedBrand } from "@/lib/db";

const MARKET_OPTIONS = ["한국 (KR)", "미국 (US)", "전세계"];

// Matches Figma "브랜드 상세 (Brand Detail)" (doc §22). Save is local-only
// (no PUT /brands/{id} yet) — same mock stage as the rest of Brands
// Management.
export function BrandDetailClient({ initial }: { initial: ManagedBrand }) {
  const [brand, setBrand] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [moveToPendingOpen, setMoveToPendingOpen] = useState(false);
  const [addAliasOpen, setAddAliasOpen] = useState(false);
  const [addOtherBrandOpen, setAddOtherBrandOpen] = useState(false);
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addSocialOpen, setAddSocialOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  function updateDraft(patch: Partial<ManagedBrand>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  function save() {
    setBrand(draft);
    setDirty(false);
  }

  function toggleMarket(market: string) {
    updateDraft({
      markets: draft.markets.includes(market) ? draft.markets.filter((m) => m !== market) : [...draft.markets, market],
    });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <Link href="/brands-management" className="flex items-center gap-2 text-[13px] text-neutral-600 hover:text-neutral-900">
        <ArrowLeft size={16} />
        브랜드 관리로 돌아가기
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{brand.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{brand.url}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/brands-management/${brand.id}/connections`}>
            <Button variant="secondary" icon={<Link2 size={14} />}>
              연결 관리
            </Button>
          </a>
          <Button variant="primary" disabled={!dirty} onClick={save}>
            변경사항 저장
          </Button>
          {brand.status === "active" && (
            <Button variant="secondary" onClick={() => setMoveToPendingOpen(true)}>
              대기 상태로 전환
            </Button>
          )}
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-neutral-900">기본 정보</h2>
        <Field label="이름 *">
          <input
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
        </Field>
        <Field label="기본 URL">
          <input disabled value={draft.url} className="h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500" />
        </Field>
        <Field label="설명">
          <textarea
            value={draft.description}
            onChange={(e) => updateDraft({ description: e.target.value })}
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="업종">
          <input
            value={draft.industry}
            onChange={(e) => updateDraft({ industry: e.target.value })}
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
            placeholder="예: B2B SaaS"
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">마켓 *</span>
          <div className="flex flex-wrap gap-2">
            {MARKET_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleMarket(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  draft.markets.includes(m) ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <ListSection
        icon={Link2}
        title="브랜드 URL"
        description="이 브랜드와 연결된 추가 URL입니다."
        items={brand.urls}
        onAdd={() => setAddUrlOpen(true)}
        onRemove={(i) => setBrand((b) => ({ ...b, urls: b.urls.filter((_, idx) => idx !== i) }))}
      />
      <ListSection
        icon={Share2}
        title="소셜 계정"
        description="이 브랜드의 공식 소셜 미디어 계정입니다."
        items={brand.socialAccounts.map((s) => `${s.platform}: ${s.handle}`)}
        onAdd={() => setAddSocialOpen(true)}
        onRemove={(i) => setBrand((b) => ({ ...b, socialAccounts: b.socialAccounts.filter((_, idx) => idx !== i) }))}
      />
      <ListSection
        icon={FileText}
        title="획득 콘텐츠 소스"
        description="이 브랜드가 자주 언급되는 외부 소스입니다."
        items={brand.earnedContentSources}
        onAdd={() => setAddSourceOpen(true)}
        onRemove={(i) => setBrand((b) => ({ ...b, earnedContentSources: b.earnedContentSources.filter((_, idx) => idx !== i) }))}
      />
      <ListSection
        icon={Tag}
        title="브랜드 별칭"
        description="AI 답변에서 이 브랜드를 지칭하는 다른 이름입니다."
        items={brand.aliases}
        onAdd={() => setAddAliasOpen(true)}
        onRemove={(i) => setBrand((b) => ({ ...b, aliases: b.aliases.filter((_, idx) => idx !== i) }))}
      />

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">추적할 기타 브랜드</h2>
            <p className="mt-0.5 text-xs text-neutral-500">경쟁사 등 함께 추적할 다른 브랜드입니다.</p>
          </div>
          <Button variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOtherBrandOpen(true)}>
            추가
          </Button>
        </div>
        {brand.otherBrands.length === 0 ? (
          <p className="text-xs text-neutral-400">아직 추가된 브랜드가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {brand.otherBrands.map((b, i) => (
              <span key={b} className="flex items-center gap-1.5 rounded-full bg-neutral-100 py-1 pl-3 pr-2 text-xs text-neutral-700">
                {b}
                <button
                  type="button"
                  aria-label={`${b} 삭제`}
                  onClick={() => setBrand((br) => ({ ...br, otherBrands: br.otherBrands.filter((_, idx) => idx !== i) }))}
                  className="cursor-pointer text-neutral-400 hover:text-red-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <SimpleAddModal open={addAliasOpen} title="별칭 추가" label="별칭" onClose={() => setAddAliasOpen(false)} onAdd={(v) => setBrand((b) => ({ ...b, aliases: [...b.aliases, v] }))} />
      <SimpleAddModal
        open={addOtherBrandOpen}
        title="기타 브랜드 추가"
        label="브랜드 이름"
        onClose={() => setAddOtherBrandOpen(false)}
        onAdd={(v) => setBrand((b) => ({ ...b, otherBrands: [...b.otherBrands, v] }))}
      />
      <SimpleAddModal open={addUrlOpen} title="URL 추가" label="URL" onClose={() => setAddUrlOpen(false)} onAdd={(v) => setBrand((b) => ({ ...b, urls: [...b.urls, v] }))} />
      <SimpleAddModal
        open={addSourceOpen}
        title="획득 콘텐츠 소스 추가"
        label="도메인"
        onClose={() => setAddSourceOpen(false)}
        onAdd={(v) => setBrand((b) => ({ ...b, earnedContentSources: [...b.earnedContentSources, v] }))}
      />
      <SimpleAddModal
        open={addSocialOpen}
        title="소셜 계정 추가"
        label="플랫폼: 계정"
        placeholder="예: LinkedIn: neodigm"
        onClose={() => setAddSocialOpen(false)}
        onAdd={(v) => {
          const [platform, handle] = v.split(":").map((s) => s.trim());
          setBrand((b) => ({ ...b, socialAccounts: [...b.socialAccounts, { platform: platform || v, handle: handle || "" }] }));
        }}
      />

      <Modal open={moveToPendingOpen} onClose={() => setMoveToPendingOpen(false)}>
        <MoveToPendingForm
          brand={brand}
          onClose={() => setMoveToPendingOpen(false)}
          onConfirm={() => {
            setBrand((b) => ({ ...b, status: "pending" }));
            setMoveToPendingOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function ListSection({
  icon: Icon,
  title,
  description,
  items,
  onAdd,
  onRemove,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  items: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} />
          <div>
            <h2 className="text-base font-bold text-neutral-900">{title}</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
          </div>
        </div>
        <Button variant="secondary" icon={<Plus size={14} />} onClick={onAdd}>
          추가
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-400">아직 추가된 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={item} className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              {item}
              <button
                type="button"
                aria-label={`${item} 삭제`}
                onClick={() => onRemove(i)}
                className="cursor-pointer text-neutral-400 hover:text-red-600"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SimpleAddModal({
  open,
  title,
  label,
  placeholder,
  onClose,
  onAdd,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  onClose: () => void;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <Field label={label}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary">
            추가
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MoveToPendingForm({ brand, onClose, onConfirm }: { brand: ManagedBrand; onClose: () => void; onConfirm: () => void }) {
  const [understood, setUnderstood] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">대기 상태로 전환</h2>
        <ModalCloseButton onClose={onClose} />
      </div>
      <p className="mt-3 text-sm text-neutral-600">
        <b>{brand.name}</b>을(를) 대기 상태로 전환하면 이 브랜드와 연결된 실행 중인 프롬프트가 모두 일시 중지됩니다.
      </p>
      <label className="mt-4 flex items-start gap-2 text-xs text-neutral-600">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 cursor-pointer accent-slate-800" />
        영향을 이해했습니다.
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" disabled={!understood} onClick={onConfirm}>
          대기 상태로 전환
        </Button>
      </div>
    </>
  );
}
