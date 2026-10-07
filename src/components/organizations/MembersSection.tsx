"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCloseButton } from "@/components/ui/Modal";
import type { MemberRow } from "@/lib/backend/auth/authStore";

interface BrandOption {
  id: string;
  name: string;
}

type Mode = { kind: "assign" } | { kind: "issue" } | { kind: "edit"; member: MemberRow } | null;

const inputClass = "h-10 w-full rounded-md border border-neutral-300 px-3 text-sm";

function roleBadge(m: MemberRow) {
  if (m.isOwner) return <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">오너</span>;
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${m.role === "admin" ? "bg-sky-100 text-sky-700" : "bg-neutral-100 text-neutral-600"}`}>{m.role}</span>
  );
}

// 설정 > 조직 관리의 구성원 — 오너(와 네오다임 직원)만 보인다. 역할(admin/viewer)과 볼 수 있는 브랜드를 할당한다.
export function MembersSection({ orgName, currentUserId }: { orgName: string; currentUserId: string | null }) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/members", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMembers(data.members);
      setBrands(data.brands);
    } else {
      setMembers([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 처음 한 번 구성원 목록을 불러온다
    void reload();
  }, [reload]);

  function open(next: Mode) {
    setMode(next);
    setError(null);
    setLoginId("");
    setName("");
    setRole(next?.kind === "edit" ? next.member.role : "viewer");
    setBrandIds(next?.kind === "edit" ? next.member.brandIds : []);
  }

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "실패했어요.");
      return null;
    }
    return data as Record<string, unknown>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    if (mode.kind === "issue") {
      const data = await call("/api/members/issue", { method: "POST", body: JSON.stringify({ loginId, name, role, brandIds }) });
      if (!data) return;
      setNotice({ title: `${data.loginId} 계정을 발급했어요`, password: String(data.tempPassword) });
    } else if (mode.kind === "assign") {
      if (!(await call("/api/members", { method: "POST", body: JSON.stringify({ loginId, role, brandIds }) }))) return;
    } else if (!(await call("/api/members", { method: "PATCH", body: JSON.stringify({ userId: mode.member.userId, role, brandIds }) }))) return;
    setMode(null);
    await reload();
  }

  async function remove(m: MemberRow) {
    if (!window.confirm(`${m.name}(${m.loginId})을(를) 이 조직에서 제거할까요? 계정은 남고 이 조직에는 접근할 수 없게 돼요.`)) return;
    if (await call(`/api/members?userId=${encodeURIComponent(m.userId)}`, { method: "DELETE" })) await reload();
    else window.alert(error ?? "제거하지 못했어요.");
  }

  async function reissue(m: MemberRow) {
    if (!window.confirm(`${m.name}의 임시 비밀번호를 다시 발급할까요? 기존 비밀번호와 로그인은 모두 해제돼요.`)) return;
    const data = await call("/api/members/reissue", { method: "POST", body: JSON.stringify({ userId: m.userId }) });
    if (data) setNotice({ title: `${m.loginId}의 임시 비밀번호`, password: String(data.tempPassword) });
  }

  async function makeOwner(m: MemberRow) {
    if (!window.confirm(`오너를 ${m.name}에게 이전할까요? 오너는 조직당 1명이에요.`)) return;
    if (await call("/api/members/owner", { method: "POST", body: JSON.stringify({ userId: m.userId }) })) await reload();
  }

  const toggleBrand = (id: string) => setBrandIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 pb-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">구성원 — {orgName}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            오너가 역할과 볼 수 있는 브랜드를 할당해요. admin은 지정받은 브랜드만 편집하고, viewer는 읽기만 해요. 가입한 사람은 권한을 할당받아야 화면을 볼 수 있어요.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => open({ kind: "assign" })}>
            가입한 사용자 할당
          </Button>
          <Button variant="primary" onClick={() => open({ kind: "issue" })}>
            계정 발급
          </Button>
        </div>
      </div>

      {notice && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-neutral-900">{notice.title}</p>
          <p className="mt-1 text-xs text-neutral-600">임시 비밀번호는 지금 한 번만 보여요. 안전한 방법으로 전달해 주세요. 첫 로그인 때 새 비밀번호로 바꾸게 돼요.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="rounded bg-white px-3 py-1.5 text-sm font-mono text-neutral-900">{notice.password}</code>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(notice.password)}>
              복사
            </Button>
            <Button variant="secondary" onClick={() => setNotice(null)}>
              닫기
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        {members === null ? (
          <p className="p-6 text-center text-sm text-neutral-400">불러오는 중…</p>
        ) : members.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">아직 구성원이 없어요.</p>
        ) : (
          <ul>
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-5 py-3 last:border-b-0">
                <div className="min-w-[200px] flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                    {m.name} {roleBadge(m)}
                    {m.mustChangePassword && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">임시 비밀번호</span>}
                    {m.userId === currentUserId && <span className="text-[11px] text-neutral-400">(나)</span>}
                  </p>
                  <p className="text-xs text-neutral-500">{m.loginId}</p>
                </div>
                <p className="min-w-[160px] flex-1 text-xs text-neutral-500">
                  {m.isOwner ? "모든 브랜드" : m.brandIds.length === 0 ? <span className="text-amber-600">지정된 브랜드 없음</span> : m.brandIds.map(brandName).join(", ")}
                </p>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="secondary" onClick={() => open({ kind: "edit", member: m })}>
                    권한
                  </Button>
                  <Button variant="secondary" onClick={() => reissue(m)}>
                    임시 비밀번호
                  </Button>
                  {!m.isOwner && m.role === "admin" && (
                    <Button variant="secondary" onClick={() => makeOwner(m)}>
                      오너로
                    </Button>
                  )}
                  {!m.isOwner && (
                    <Button variant="secondary" onClick={() => remove(m)}>
                      제거
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={mode !== null} onClose={() => setMode(null)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-neutral-900">{mode?.kind === "issue" ? "계정 발급" : mode?.kind === "edit" ? "권한 변경" : "가입한 사용자 할당"}</h3>
          <ModalCloseButton onClose={() => setMode(null)} />
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {mode?.kind === "issue" ? "계정을 만들고 임시 비밀번호를 한 번 보여드려요(메일은 발송되지 않아요)." : mode?.kind === "edit" ? mode.member.loginId : "이미 가입한 사용자의 아이디로 이 조직에 역할을 할당해요."}
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          {mode?.kind !== "edit" && (
            <>
              {mode?.kind === "issue" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-neutral-500">이름 *</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-neutral-500">아이디 *</label>
                <input type="text" autoCapitalize="none" spellCheck={false} required value={loginId} onChange={(e) => setLoginId(e.target.value)} className={inputClass} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">역할 *</label>
            <select
              value={mode?.kind === "edit" && mode.member.isOwner ? "admin" : role}
              disabled={mode?.kind === "edit" && mode.member.isOwner}
              onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
              className={inputClass}
            >
              <option value="viewer">viewer — 지정한 브랜드를 읽기만</option>
              <option value="admin">admin — 지정한 브랜드를 편집</option>
            </select>
          </div>
          {!(mode?.kind === "edit" && mode.member.isOwner) && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-500">볼 수 있는 브랜드</label>
              {brands.length === 0 ? (
                <p className="text-xs text-neutral-400">이 조직에 브랜드가 없어요.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBrand(b.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                        brandIds.includes(b.id) ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-neutral-400">admin마다 다른 브랜드를 지정할 수 있어요. 브랜드를 지정하지 않으면 화면을 볼 수 없어요.</p>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "처리 중..." : mode?.kind === "issue" ? "발급" : "저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
