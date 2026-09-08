import { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "detail" | "link";
type Size = "md" | "sm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-slate-800 text-white hover:opacity-90",
  secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
  ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100",
  // Figma "WF Button" (node 646:28300) — used for panel-level "자세히 보기" actions.
  detail: "bg-slate-100 text-slate-800 hover:bg-slate-200",
  // Bare text + icon, no background — row-level navigation actions (e.g. "상세").
  link: "bg-transparent text-slate-800 hover:opacity-70",
};

// Padding/text size live per-size (not layered onto a shared base) so a
// "sm" button's classes never have to out-rank "md" defaults in the
// generated stylesheet — Tailwind orders utilities by its own internal
// scale, not by source order, so two conflicting size classes on one
// element can silently pick the wrong one.
const sizeClasses: Record<Size, string> = {
  md: "px-3.5 py-2 text-sm rounded-md",
  sm: "px-2 py-1 text-sm rounded-md",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Which side `icon` renders on. Defaults to "start". */
  iconPosition?: "start" | "end";
  /** Navigates to a page instead of firing onClick — renders a Link with
   *  the same classes so it works from a server component (no onClick
   *  handler needed), e.g. Overview's chart panel "자세히보기" actions. */
  href?: string;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconPosition = "start",
  className,
  children,
  href,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer",
    sizeClasses[size],
    variantClasses[variant],
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {icon && iconPosition === "start" && icon}
        {children}
        {icon && iconPosition === "end" && icon}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {icon && iconPosition === "start" && icon}
      {children}
      {icon && iconPosition === "end" && icon}
    </button>
  );
}
