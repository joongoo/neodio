"use client";

import { createContext, ReactNode, useContext, useEffect } from "react";
import { isBlockedForReadOnly, READ_ONLY_MESSAGE } from "@/lib/auth/readOnly";

// 화면이 "이 사용자가 편집할 수 있는가"를 알게 하는 컨텍스트. 로그인 체계가 꺼져 있으면 항상 true(지금과 동일).
// 서버가 모든 쓰기를 최종적으로 막으므로(guardApi) 이것은 UX다 — 못 하는 일의 버튼을 숨기고, 놓친 곳은 요청을 보내기 전에 안내한다.
interface Permissions {
  canEdit: boolean;
  canManageOrg: boolean;
}

const PermissionsContext = createContext<Permissions>({ canEdit: true, canManageOrg: true });

export const useCanEdit = () => useContext(PermissionsContext).canEdit;
export const useCanManageOrg = () => useContext(PermissionsContext).canManageOrg;

/** 편집 권한이 있을 때만 보이는 영역(버튼·폼). 없으면 fallback(기본은 아무것도 안 그림). */
export function EditOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useCanEdit() ? children : fallback}</>;
}

/** 조직 관리 권한(오너·직원)이 있을 때만 보이는 영역. */
export function OrgManagerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <>{useCanManageOrg() ? children : fallback}</>;
}

function showToast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:9999;background:#1e293b;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.2)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// 편집 권한이 없을 때, 숨기지 못한 곳에서 쓰기 요청이 나가려 하면 서버에 보내기 전에 막고 안내한다.
function useReadOnlyFetchGuard(canEdit: boolean) {
  useEffect(() => {
    if (canEdit) return;
    const original = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : undefined);
      if (isBlockedForReadOnly(method, url)) {
        showToast(READ_ONLY_MESSAGE);
        return Promise.resolve(new Response(JSON.stringify({ error: READ_ONLY_MESSAGE }), { status: 403, headers: { "Content-Type": "application/json" } }));
      }
      return original(input, init);
    };
    return () => {
      window.fetch = original;
    };
  }, [canEdit]);
}

export function PermissionsProvider({ canEdit, canManageOrg, children }: Permissions & { children: ReactNode }) {
  useReadOnlyFetchGuard(canEdit);
  return <PermissionsContext.Provider value={{ canEdit, canManageOrg }}>{children}</PermissionsContext.Provider>;
}
