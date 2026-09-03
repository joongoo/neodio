import { Bell, User } from "lucide-react";

// Matches Figma "TopBar_ko" (node 646:28920, Korean page). Per
// neodigm_p0_scope.md, P0 is single-org — the org dropdown is dropped and
// the product name "Neodio" takes its place.
export function TopBar() {
  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-[#fbfbfb] px-6 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded bg-slate-800 text-sm font-bold text-white">
        N
      </div>
      <p className="text-base font-bold text-black">Neodio</p>
      <div className="flex-1" />
      <button
        type="button"
        aria-label="알림"
        className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
      >
        <Bell size={16} />
      </button>
      <button
        type="button"
        aria-label="프로필"
        className="grid place-items-center rounded-md p-2 text-neutral-500 hover:bg-neutral-100 cursor-pointer"
      >
        <User size={16} />
      </button>
    </header>
  );
}
