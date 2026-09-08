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

// Matches Figma "LNB / Sidebar_ko" (node 646:29832, Korean page) — a flat,
// always-expanded nav tree with no collapse affordance, so no client state
// is needed beyond active-link detection.
//
// Re-scoped to P0 per neodigm_p0_scope.md: only screens buildable from data
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

const NAV: NavGroup[] = [
  { label: "개요", href: "/", icon: Home },
  {
    label: "AI 가시성",
    href: "#",
    icon: TrendingUp,
    children: [
      { label: "가시성 개요", href: "/visibility-overview" },
      { label: "프롬프트 리서치", href: "/prompt-research" },
      { label: "검색결과 리서치", href: "/search-collection" },
      { label: "검색어 트렌드", href: "/search-trend" },
      { label: "검색 성과 (GSC)", href: "/search-performance" },
      { label: "수집 로그", href: "/collection-runs" },
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
    children: [{ label: "브랜드 가시성", href: "/brand-presence" }],
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
    children: [{ label: "브랜드 관리", href: "/brands-management" }],
  },
  { label: "도움말 및 학습", href: "#", icon: HelpCircle },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-y-auto bg-[#fbfbfb] pb-2">
      {NAV.map((item) => (
        <div key={item.label}>
          <NavRow
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={pathname === item.href}
          />
          {item.children?.map((child) => (
            <NavRow key={child.label} label={child.label} href={child.href} indent active={pathname === child.href} />
          ))}
        </div>
      ))}
    </aside>
  );
}

function NavRow({
  icon: Icon,
  label,
  href,
  indent,
  active,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  href: string;
  indent?: boolean;
  active?: boolean;
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
      <span className="flex-1">{label}</span>
    </a>
  );
}
