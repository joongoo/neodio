import { Bell, User } from "lucide-react";

// Matches Figma "TopBar_ko" (node 646:28920, Korean page).
export function TopBar() {
  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-[#fbfbfb] px-6 py-3">
      <div className="grid size-8 shrink-0 place-items-center rounded bg-slate-800 text-sm font-bold text-white">
        N
      </div>
      <p className="text-base font-bold text-black">브랜드 가시성 대시보드</p>
      <div className="flex-1" />
      <span className="text-[13px] font-medium text-black">조직</span>
      <button
        type="button"
        className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-bold text-white cursor-pointer"
      >
        Demo Organization
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
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
