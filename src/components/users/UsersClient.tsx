"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { UserRow } from "@/lib/backend/auth/userAdminStore";

function roleBadge(m: UserRow["memberships"][number]) {
  const style = m.isOwner ? "bg-slate-800 text-white" : m.role === "admin" ? "bg-sky-100 text-sky-700" : "bg-neutral-100 text-neutral-600";
  return (
    <span key={m.organizationId} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${style}`}>
      {m.organizationName} · {m.isOwner ? "오너" : m.role}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric" });
}

// 유저 관리 목록 — 직원은 전체 유저, 오너·admin은 자기 조직 유저. 행을 누르면 상세(조직·브랜드 할당)로 간다.
export function UsersClient({ users, isStaff }: { users: UserRow[]; isStaff: boolean }) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.memberships.map((m) => m.organizationName).join(" ")}`.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">유저 관리</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isStaff ? "전체 유저를 보고 조직과 브랜드를 할당해요." : "내 조직의 유저를 보고 브랜드를 할당해요."} 행을 누르면 상세 화면으로 이동해요.
        </p>
      </div>

      <div className="flex h-9 w-[320px] items-center gap-2 rounded-full border border-neutral-300 bg-white px-3">
        <Search size={16} className="shrink-0 text-neutral-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름·아이디·조직 검색" aria-label="유저 검색" className="min-w-0 flex-1 text-[13px] text-neutral-700 outline-none placeholder:text-neutral-400" />
      </div>

      <Card className="p-0">
        <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-2.5 text-xs font-medium text-neutral-500">
          <span className="min-w-0 flex-1">이름 · 아이디</span>
          <span className="w-[280px] shrink-0">조직 · 역할</span>
          <span className="w-[70px] shrink-0">상태</span>
          <span className="w-[90px] shrink-0">마지막 로그인</span>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">{users.length === 0 ? "유저가 없어요." : "검색 결과가 없어요."}</p>
        ) : (
          <ul>
            {rows.map((u) => (
              <li key={u.userId} className="border-b border-neutral-100 last:border-b-0">
                <Link href={`/users/${u.userId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-900">
                      {u.name}
                      {u.platformRole === "staff" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">네오다임</span>}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{u.email}</p>
                  </div>
                  <div className="flex w-[280px] shrink-0 flex-wrap gap-1">
                    {u.memberships.length > 0 ? u.memberships.map(roleBadge) : <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">할당 대기</span>}
                  </div>
                  <span className={`w-[70px] shrink-0 text-xs ${u.status === "active" ? "text-emerald-600" : "text-red-600"}`}>{u.status === "active" ? "사용 중" : "중지"}</span>
                  <span className="w-[90px] shrink-0 text-xs text-neutral-500">{formatDate(u.lastLoginAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
