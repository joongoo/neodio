/** 실행 시각 → "9. 29." 같은 짧은 날짜(한국어, 월·일). 확장형 표의 "실행일" 열이 같이 쓴다. */
export function formatRunAt(runAt?: string) {
  if (!runAt) return "—";
  const d = new Date(runAt);
  return Number.isNaN(d.getTime()) ? runAt : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
