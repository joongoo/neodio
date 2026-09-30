// YouTube 관리 화면이 서버·클라이언트 양쪽에서 쓰는 값 — Node 모듈을 가져오지 않는다.

/** "최근"의 기준 — 이 기간 안에 이 영상을 인용한 프롬프트를 센다. */
export const RECENT_DAYS = 28;

/** ISO 게시일 → "2026-09-21", 없으면 "–" */
export function publishedDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "–";
}
