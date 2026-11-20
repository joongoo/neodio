"use client";

import {
  Home,
  TrendingUp,
  MessageSquareText,
  CheckCircle2,
  Globe,
  Sparkles,
  Settings,
  HelpCircle,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

// Matches Figma "LNB / Sidebar_ko" (node 646:29832, Korean page) — a flat,
// always-expanded nav tree with no collapse affordance, so no client state
// is needed beyond active-link detection.
//
// Re-scoped to P0 per docs/product/p0-scope-spec.md: only screens buildable from data
// we can directly collect (our own LLM/AI-search runs, sitemap crawling,
// LLM topic brainstorming) are listed. Screens that structurally need
// 3rd-party SEO/analytics data (Market Comparison, Prompt Strategy, Brand
// Claims, Agentic Traffic, Traffic Insights, Business Impact) are dropped
// from the nav until that data source exists — see the doc's §2 table.

interface NavLeaf {
  label: string;
  href: string;
}

interface NavGroup {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children?: NavLeaf[];
}

function YouTubeIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568l6.273-3.568-6.273-3.568v7.136Z" />
    </svg>
  );
}

const NAV: NavGroup[] = [
  { label: "개요", href: "/", icon: Home },
  {
    label: "AI 가시성",
    href: "#",
    icon: TrendingUp,
    children: [
      { label: "가시성 개요", href: "/visibility-overview" },
      { label: "프롬프트 리서치", href: "/prompt-research" },
      { label: "검색어 트렌드", href: "/search-trend" },
      { label: "검색 성과 (GSC)", href: "/search-performance" },
      { label: "수집 로그", href: "/collection-runs" },
    ],
  },
  {
    label: "YouTube",
    href: "#",
    icon: YouTubeIcon,
    children: [
      { label: "인용", href: "/citations" },
      { label: "영상 관리", href: "/youtube-manage" },
    ],
  },
  {
    label: "프롬프트 관리",
    href: "#",
    icon: MessageSquareText,
    children: [
      { label: "프롬프트 전략", href: "/prompt-strategy" },
      { label: "프롬프트 라이브러리", href: "/prompt-library" },
    ],
  },
  {
    label: "브랜드 관리",
    href: "#",
    icon: CheckCircle2,
    children: [
      { label: "브랜드 가시성", href: "/brand-presence" },
      { label: "리포트", href: "/reports" },
    ],
  },
  {
    label: "도메인",
    href: "#",
    icon: Globe,
    children: [{ label: "URL 인스펙터", href: "/url-inspector" }],
  },
  {
    label: "기회",
    href: "#",
    icon: Sparkles,
    children: [{ label: "개요", href: "/opportunities" }],
  },
  {
    label: "설정",
    href: "#",
    icon: Settings,
    children: [
      { label: "조직 관리", href: "/organizations" },
      { label: "브랜드 설정", href: "/brands-management" },
      { label: "변경 이력", href: "/change-history" },
      { label: "유저 관리", href: "/users" },
    ],
  },
  { label: "도움말 및 학습", href: "/help", icon: HelpCircle },
];

// 조직·브랜드와 무관한 화면 — 이것들만 주소 앞에 /{조직}/{브랜드}를 붙이지 않는다.
const GLOBAL_HREFS = new Set(["/organizations", "/users", "/help"]);

/** 메뉴 경로 → 실제 주소. base = "/{조직}/{브랜드}" (AppShell이 넘긴다) */
function resolveHref(href: string, base: string): string {
  if (href === "#" || GLOBAL_HREFS.has(href)) return href;
  return href === "/" ? base : `${base}${href}`;
}

// 유저 관리는 직원·오너·admin에게만 보인다(유저/viewer와 로그인이 꺼진 상태에서는 숨김).
export function Sidebar({
  base,
  showUsers = false,
  collectionIndicator,
}: {
  base: string;
  showUsers?: boolean;
  collectionIndicator?: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-y-auto bg-[#fbfbfb] pb-2 print:hidden">
      {NAV.map((item) => {
        const href = resolveHref(item.href, base);
        return (
          <div key={item.label}>
            <NavRow icon={item.icon} label={item.label} href={href} active={pathname === href} />
            {item.children?.filter((child) => child.href !== "/users" || showUsers).map((child) => {
              const childHref = resolveHref(child.href, base);
              return (
                // 하위 경로(예: …/youtube-aio/<키워드>)에서도 메뉴가 선택돼 보이도록.
                <NavRow
                  key={child.label}
                  label={child.label}
                  href={childHref}
                  indent
                  active={pathname === childHref || pathname.startsWith(`${childHref}/`)}
                  indicator={child.href === "/collection-runs" ? collectionIndicator : undefined}
                />
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}

function NavRow({
  icon: Icon,
  label,
  href,
  indent,
  active,
  indicator,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  indent?: boolean;
  active?: boolean;
  indicator?: ReactNode;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-center gap-2.5 py-3 text-sm font-medium",
        indent ? "pl-12 pr-6" : "px-6",
        active ? "bg-slate-200 text-slate-800" : "text-slate-500 hover:bg-neutral-100"
      )}
    >
      {Icon && <Icon size={16} className={active ? "text-slate-800" : "text-slate-500"} />}
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {indicator}
    </a>
  );
}
