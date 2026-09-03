import { AlertTriangle, FileWarning } from "lucide-react";

// Matches Figma "Opportunities" (doc §13), trimmed to P0 — only the two
// technical opportunities we can honestly diagnose ourselves (robots.txt,
// content visibility) are listed. Everything else needs 3rd-party data or
// infra we don't have yet (neodigm_p0_scope.md §2).
const OPPORTUNITIES = [
  {
    href: "/opportunities/robots-txt",
    icon: FileWarning,
    title: "robots.txt로 차단된 트래픽",
    description: "AI 에이전트가 robots.txt에 의해 접근을 차단당한 URL을 진단합니다.",
    category: "기술적 SEO",
  },
  {
    href: "/opportunities/content-recovery",
    icon: AlertTriangle,
    title: "콘텐츠 가시성 회복",
    description: "AI 에이전트가 JavaScript를 실행하지 못해 놓치는 콘텐츠를 찾아 최적화합니다.",
    category: "기술적 GEO",
  },
];

export default function OpportunitiesPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">기회</h1>
        <p className="mt-1 text-sm text-neutral-500">지금 바로 진단하고 조치할 수 있는 기술적 기회입니다.</p>
      </div>

      <div className="flex flex-col gap-4">
        {OPPORTUNITIES.map((opp) => (
          <a
            key={opp.href}
            href={opp.href}
            className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 transition-colors hover:bg-neutral-50"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <opp.icon size={18} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900">{opp.title}</h2>
                <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-500">
                  {opp.category}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{opp.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
