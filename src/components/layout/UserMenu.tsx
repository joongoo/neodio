"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "lucide-react";

// 헤더의 프로필 메뉴 — 로그인 체계가 켜져 있을 때 이름·역할, 내 계정(비밀번호 변경), 로그아웃.
export function UserMenu({ name, loginId, roleLabel }: { name: string; loginId: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="프로필"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-2 text-sm text-neutral-600 hover:bg-neutral-100 cursor-pointer"
      >
        <User size={16} />
        <span className="max-w-[120px] truncate">{name}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-neutral-200 bg-white py-2 shadow-lg">
          <div className="border-b border-neutral-100 px-4 pb-2">
            <p className="truncate text-sm font-medium text-neutral-900">{name}</p>
            <p className="truncate text-xs text-neutral-500">{loginId}</p>
            <p className="mt-1 text-[11px] text-neutral-400">{roleLabel}</p>
          </div>
          <Link href="/account" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100">
            내 정보 수정
          </Link>
          <button type="button" onClick={logout} className="block w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 cursor-pointer">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
