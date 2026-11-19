"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

export function RequestRowLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const router = useRouter();
  return <tr tabIndex={0} aria-label={label}
    className="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-400"
    onClick={event => {
      if ((event.target as HTMLElement).closest("a,button,input,select,textarea")) return;
      if (window.getSelection()?.toString()) return;
      if (event.ctrlKey || event.metaKey) window.open(href, "_blank", "noopener,noreferrer");
      else router.push(href);
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      router.push(href);
    }}>
    {children}
  </tr>;
}
