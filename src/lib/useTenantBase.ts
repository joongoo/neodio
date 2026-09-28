"use client";

import { useParams } from "next/navigation";

/**
 * 지금 화면의 조직·브랜드 주소 앞부분: "/{조직}/{브랜드}" — 클라이언트 컴포넌트의
 * 내부 링크에 붙인다(서버 컴포넌트는 getCurrentTenant().base). 조직 무관 화면에서는
 * ""(주소 없는 링크는 프록시가 마지막으로 본 조직·브랜드로 보낸다).
 */
export function useTenantBase(): string {
  const params = useParams<{ org?: string; brand?: string }>();
  if (!params?.org || !params?.brand) return "";
  const part = (value: string) => encodeURIComponent(decodeURIComponent(value));
  return `/${part(params.org)}/${part(params.brand)}`;
}
