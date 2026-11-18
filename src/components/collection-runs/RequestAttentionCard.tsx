import Link from "next/link";

export function RequestAttentionCard({ count, path, active }: { count: number; path: string; active: boolean }) {
  return <section aria-label="수집 확인 현황">
    <Link href={`${path}?attention=1`} aria-current={active ? "page" : undefined}
      className={`block rounded-xl border p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${active ? "border-orange-400 bg-orange-50" : "border-orange-200 bg-white hover:bg-orange-50"}`}>
      <div className="flex items-center justify-between gap-4">
        <div><h2 className="text-sm font-semibold text-orange-800">확인 필요</h2><p className="mt-1 text-xs leading-5 text-neutral-500">로컬·Gemini·SERP API의 실패·제출 여부 불명확 항목 중 재수집이 등록되지 않은 개별 작업 수입니다. 취소 건은 제외합니다.</p></div>
        <strong className="shrink-0 text-3xl tabular-nums text-orange-700">{count}<span className="ml-1 text-sm font-medium">건</span></strong>
      </div>
      <p className="mt-3 text-xs font-medium text-orange-800">해당 수집 요청 보기 →</p>
    </Link>
    {active && <p className="mt-2 text-xs text-neutral-600">확인 필요 작업이 포함된 요청만 표시하고 있습니다. <Link href={path} className="underline">전체 요청 보기</Link></p>}
  </section>;
}
