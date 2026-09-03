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
      { label: "프롬프트 리서치", href: "#" },
      { label: "마켓 비교", href: "#" },
    ],
  },
  {
    label: "프롬프트 관리",
    href: "#",
    icon: MessageSquareText,
    children: [
      { label: "프롬프트 전략", href: "#" },
      { label: "프롬프트 라이브러리", href: "#" },
    ],
  },
  {
    label: "브랜드 관리",
    href: "#",
    icon: CheckCircle2,
    children: [
      { label: "브랜드 가시성", href: "#" },
      { label: "브랜드 전략", href: "#" },
    ],
  },
  {
    label: "도메인",
    href: "#",
    icon: Globe,
    children: [
      { label: "URL 인스펙터", href: "#" },
      { label: "에이전틱 트래픽", href: "#" },
      { label: "트래픽 인사이트", href: "#" },
      { label: "비즈니스 임팩트", href: "#" },
    ],
  },
  {
    label: "기회",
    href: "#",
    icon: Sparkles,
    children: [
      { label: "개요", href: "#" },
      { label: "기회 워크스페이스", href: "#" },
    ],
  },
  {
    label: "설정",
    href: "#",
    icon: Settings,
    children: [{ label: "브랜드 관리", href: "#" }],
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
