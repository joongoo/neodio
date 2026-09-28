"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";

interface OrgRow {
  id: string;
  name: string;
  brandCount: number;
}

const ORG_COOKIE = "selected-org";
const BRAND_COOKIE = "selected-brand";

// 설정 > 조직 관리 — 대행사처럼 여러 고객(예: Neodigm, Salesforce)을 각자의
// 브랜드·프롬프트·수집 데이터로 나눠 관리한다. 조직 전환은 헤더 스위처와
// 같은 쿠키를 쓴다(src/lib/backend/tenant.ts).
export function OrganizationsClient({ initial, currentOrgId }: { initial: OrgRow[]; currentOrgId: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/organizations", { cache: "no-store" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data?.organizations) setOrgs(data.organizations);
    router.refresh();
  }

  function switchTo(org: OrgRow, next = "/brands-management") {
    document.cookie = `${ORG_COOKIE}=${encodeURIComponent(org.id)}; path=/; max-age=31536000`;
    document.cookie = `${BRAND_COOKIE}=; path=/; max-age=0`;
    router.push(next);
    router.refresh();
  }

  async function rename(org: OrgRow) {
    setError(null);
    const res = await fetch("/api/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: org.id, name: editName }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "이름을 바꾸지 못했습니다.");
      return;
    }
    setEditing(null);
    await reload();
  }

  async function remove(org: OrgRow) {
    if (!window.confirm(`"${org.name}" 조직을 삭제할까요? 조직의 프롬프트·카테고리·수집 기록도 함께 삭제됩니다.`)) return;
    setError(null);
    const res = await fetch(`/api/organizations?id=${encodeURIComponent(org.id)}`, { method: "DELETE" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "삭제하지 못했습니다.");
      return;
    }
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">조직 관리</h1>
          <p className="mt-1 text-sm text-neutral-500">
            조직마다 브랜드·프롬프트·카테고리·수집 기록·YouTube AIO 추적이 따로 관리됩니다. 헤더의 &quot;조직&quot;에서 전환합니다.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
          조직 추가
        </Button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {orgs.map((org) => {
            const current = org.id === currentOrgId;
            return (
              <li key={org.id} className="flex items-center gap-4 px-5 py-4">
                <Building2 size={18} className="shrink-0 text-neutral-400" />
                {editing === org.id ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(org);
                    }}
                  >
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      aria-label="조직 이름"
                      className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm"
                    />
                    <button type="submit" aria-label="저장" className="rounded-md p-1.5 text-emerald-600 hover:bg-neutral-100 cursor-pointer">
                      <Check size={16} />
                    </button>
                    <button type="button" aria-label="취소" onClick={() => setEditing(null)} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 cursor-pointer">
                      <X size={16} />
                    </button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                      {org.name}
                      {current && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">현재 조직</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">브랜드 {org.brandCount}개</p>
                  </div>
                )}
                {editing !== org.id && (
                  <div className="flex shrink-0 items-center gap-1">
                    {!current && (
                      <Button variant="secondary" size="sm" icon={<ArrowRight size={14} />} iconPosition="end" onClick={() => switchTo(org)}>
                        이 조직으로 전환
                      </Button>
                    )}
                    <button
                      type="button"
                      aria-label={`${org.name} 이름 변경`}
                      onClick={() => {
                        setEditing(org.id);
                        setEditName(org.name);
                      }}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${org.name} 삭제`}
                      title={org.brandCount > 0 ? "브랜드가 남아 있는 조직은 삭제할 수 없습니다" : undefined}
                      disabled={org.brandCount > 0 || orgs.length === 1}
                      onClick={() => remove(org)}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <CreateOrgModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(org) => {
          setCreateOpen(false);
          // 새 조직은 바로 그 조직으로 전환해 첫 브랜드를 등록하게 한다.
          switchTo({ ...org, brandCount: 0 });
        }}
      />
    </div>
  );
}

function CreateOrgModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (org: { id: string; name: string }) => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setName("");
    setError(null);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setPending(false);
    if (!res?.ok) {
      setError(data?.error ?? "조직을 만들지 못했습니다.");
      return;
    }
    setName("");
    onCreated(data.organization);
  }

  return (
    <Modal open={open} onClose={close}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">조직 추가</h2>
        <ModalCloseButton onClose={close} />
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-600">조직 이름 *</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: Salesforce"
            maxLength={50}
            autoFocus
            className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          />
        </label>
        <p className="text-xs text-neutral-500">만든 뒤 이 조직으로 전환되고, 브랜드 설정에서 첫 브랜드를 등록하면 됩니다.</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
            {pending ? "만드는 중…" : "만들기"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
