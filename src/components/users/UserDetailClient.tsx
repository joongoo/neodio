"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { OrgChoice, UserDetail } from "@/lib/backend/auth/userAdminStore";
import type { ChangeEntry } from "@/lib/changeLog";

// 유저 상세 — 직원: 조직 할당·브랜드 할당 / 오너·admin: 브랜드 할당(admin은 본인이 접근 가능한 브랜드 안에서만).
// 버튼은 서버가 알려준 권한(can)대로 보이고, 서버가 다시 검사한다.
const inputClass = "h-10 w-full rounded-md border border-neutral-300 px-3 text-sm";

async function patch(userId: string, body: unknown) {
  const res = await fetch(`/api/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as { user?: UserDetail; tempPassword?: string; error?: string } };
}

function formatAt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const show = (value: unknown) => (value === null || value === undefined ? "—" : typeof value === "string" ? value || "—" : Array.isArray(value) ? (value.length ? value.join(", ") : "—") : JSON.stringify(value));

// 변경 전·후 값을 필드마다 한 줄씩(역할, 브랜드, 이름, 상태 …).
function HistoryItem({ entry }: { entry: ChangeEntry }) {
  const before = (entry.before && typeof entry.before === "object" ? entry.before : {}) as Record<string, unknown>;
  const after = (entry.after && typeof entry.after === "object" ? entry.after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return (
    <li className="border-b border-neutral-100 py-3 last:border-b-0">
      <p className="text-sm text-neutral-800">{entry.summary}</p>
      <p className="mt-0.5 text-[11px] text-neutral-400">{entry.actorName ?? "본인(가입)"} · {formatAt(entry.at)}</p>
      {keys.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {keys.map((key) => (
            <div key={key} className="grid grid-cols-[70px_1fr_1fr] gap-2 text-xs">
              <span className="text-neutral-500">{key === "role" ? "역할" : key === "brands" ? "브랜드" : key === "name" ? "이름" : key === "status" ? "상태" : key}</span>
              <span className="rounded bg-red-50 px-2 py-0.5 text-neutral-700">{show(before[key])}</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-neutral-700">{show(after[key])}</span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export function UserDetailClient({ initial, currentUserId }: { initial: UserDetail; currentUserId: string }) {
  const [user, setUser] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [drafts, setDrafts] = useState<Record<string, string[]>>(() => Object.fromEntries(initial.memberships.map((m) => [m.organizationId, m.brandIds])));
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tempPassword, setTempPassword] = useState<{ orgName: string; password: string } | null>(null);
  const [addOrg, setAddOrg] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);

  async function run(body: unknown, success: string) {
    setBusy(true);
    setMessage(null);
    const { ok, data } = await patch(user.userId, body);
    setBusy(false);
    if (!ok) return setMessage({ kind: "error", text: data.error ?? "실패했어요." }), null;
    if (data.user) {
      setUser(data.user);
      setName(data.user.name);
      setDrafts(Object.fromEntries(data.user.memberships.map((m) => [m.organizationId, m.brandIds])));
    }
    setMessage({ kind: "ok", text: success });
    return data;
  }

  const orgOf = (id: string): OrgChoice | undefined => user.orgs.find((o) => o.id === id);
  const toggleBrand = (orgId: string, brandId: string) =>
    setDrafts((prev) => ({ ...prev, [orgId]: prev[orgId]?.includes(brandId) ? prev[orgId].filter((b) => b !== brandId) : [...(prev[orgId] ?? []), brandId] }));
  const joinedOrgIds = new Set(user.memberships.map((m) => m.organizationId));
  const addableOrgs = user.orgs.filter((o) => !joinedOrgIds.has(o.id));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
      <div>
        <Link href="/users" className="text-xs text-neutral-500 underline">← 유저 목록</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-neutral-900">
          {user.name}
          {user.platformRole === "staff" && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">네오다임</span>}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{user.email} · {user.status === "active" ? "사용 중" : "중지됨"}</p>
      </div>

      {message && <p className={`text-sm ${message.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>}
      {tempPassword && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-neutral-900">{tempPassword.orgName} 임시 비밀번호</p>
          <p className="mt-1 text-xs text-neutral-600">지금 한 번만 보여요. 안전한 방법으로 전달해 주세요. 첫 로그인 때 새 비밀번호로 바꾸게 돼요.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="rounded bg-white px-3 py-1.5 font-mono text-sm">{tempPassword.password}</code>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(tempPassword.password)}>복사</Button>
            <Button variant="secondary" onClick={() => setTempPassword(null)}>닫기</Button>
          </div>
        </Card>
      )}

      {user.can.editProfile && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-base font-bold text-neutral-900">기본 정보</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-500">이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className={inputClass} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={busy || !name.trim() || name.trim() === user.name} onClick={() => run({ action: "profile", name }, "이름을 저장했어요.")}>이름 저장</Button>
            {user.userId !== currentUserId && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (user.status === "active" && !window.confirm("이 계정을 중지할까요? 로그인이 모두 해제되고 다시 사용 중으로 바꾸기 전에는 로그인할 수 없어요.")) return;
                  void run({ action: "profile", status: user.status === "active" ? "disabled" : "active" }, user.status === "active" ? "계정을 중지했어요." : "계정을 다시 사용 중으로 바꿨어요.");
                }}
              >
                {user.status === "active" ? "계정 중지" : "계정 다시 사용"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-neutral-900">소속 · 브랜드</h2>
        {user.memberships.length === 0 && <Card className="text-sm text-neutral-500">아직 소속된 조직이 없어요(할당 대기).</Card>}
        {user.memberships.map((m) => {
          const org = orgOf(m.organizationId);
          const scope = new Set(org?.assignableBrandIds ?? []);
          const draft = drafts[m.organizationId] ?? [];
          const canBrands = user.can.assignBrands[m.organizationId];
          const dirty = [...draft].sort().join() !== [...m.brandIds].sort().join();
          return (
            <Card key={m.organizationId} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-neutral-900">{m.organizationName}</p>
                {m.isOwner ? (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">오너</span>
                ) : user.can.changeRole[m.organizationId] ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => void run({ action: "setMembership", orgId: m.organizationId, role: e.target.value }, "역할을 바꿨어요.")}
                    className="h-8 rounded-md border border-neutral-300 px-2 text-xs"
                  >
                    <option value="viewer">viewer</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{m.role}</span>
                )}
                <div className="flex-1" />
                {user.can.reissue[m.organizationId] && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm("임시 비밀번호를 다시 발급할까요? 기존 비밀번호와 로그인은 모두 해제돼요.")) return;
                      const data = await run({ action: "reissuePassword", orgId: m.organizationId }, "임시 비밀번호를 발급했어요.");
                      if (data?.tempPassword) setTempPassword({ orgName: m.organizationName, password: data.tempPassword });
                    }}
                  >
                    임시 비밀번호
                  </Button>
                )}
                {user.can.assignOrg && !m.isOwner && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => window.confirm(`${m.organizationName}에서 이 유저를 제거할까요?`) && void run({ action: "setMembership", orgId: m.organizationId, role: null }, "조직에서 제거했어요.")}
                  >
                    조직에서 제거
                  </Button>
                )}
              </div>

              {m.isOwner ? (
                <p className="text-xs text-neutral-500">오너는 이 조직의 모든 브랜드에 접근해요.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-neutral-500">볼 수 있는 브랜드</p>
                  {(org?.brands.length ?? 0) === 0 ? (
                    <p className="text-xs text-neutral-400">이 조직에 브랜드가 없어요.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {org!.brands.map((b) => {
                        const on = draft.includes(b.id);
                        const editable = canBrands && scope.has(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            disabled={!editable}
                            title={!canBrands ? undefined : editable ? undefined : "내가 접근할 수 없는 브랜드라 바꿀 수 없어요"}
                            onClick={() => toggleBrand(m.organizationId, b.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-slate-800 bg-slate-800 text-white" : "border-neutral-300 bg-white text-neutral-600"} ${
                              editable ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed opacity-50"
                            }`}
                          >
                            {b.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {canBrands && (
                    <div className="flex items-center gap-2">
                      <Button variant="primary" disabled={busy || !dirty} onClick={() => run({ action: "setBrands", orgId: m.organizationId, brandIds: draft }, "브랜드 할당을 저장했어요.")}>브랜드 할당 저장</Button>
                      {!user.can.assignOrg && <p className="text-[11px] text-neutral-400">내가 접근할 수 있는 브랜드만 바꿀 수 있어요.</p>}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="flex flex-col">
        <h2 className="text-base font-bold text-neutral-900">변경 이력</h2>
        <p className="mt-0.5 text-xs text-neutral-500">이 유저의 정보·역할·조직·브랜드 변경을 변경 전후 값과 함께 기록해요. 비밀번호 값은 기록하지 않아요.</p>
        {user.history.length === 0 ? (
          <p className="mt-3 text-xs text-neutral-400">아직 기록된 변경이 없어요.</p>
        ) : (
          <ul className="mt-2">
            {user.history.map((entry) => (
              <HistoryItem key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </Card>

      {user.can.assignOrg && addableOrgs.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-neutral-900">조직 할당</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={addOrg} onChange={(e) => setAddOrg(e.target.value)} className="h-10 min-w-[200px] rounded-md border border-neutral-300 px-3 text-sm">
              <option value="">조직 선택</option>
              {addableOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <select value={addRole} onChange={(e) => setAddRole(e.target.value as "admin" | "viewer")} className="h-10 rounded-md border border-neutral-300 px-3 text-sm">
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
            <Button variant="primary" disabled={busy || !addOrg} onClick={async () => { if (await run({ action: "setMembership", orgId: addOrg, role: addRole }, "조직에 할당했어요. 이어서 브랜드를 할당해 주세요.")) setAddOrg(""); }}>
              조직에 할당
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400">조직에 할당한 뒤 볼 수 있는 브랜드를 지정하면 화면이 열려요.</p>
        </Card>
      )}
    </div>
  );
}
