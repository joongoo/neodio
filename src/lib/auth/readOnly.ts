// 편집 권한이 없는 사용자(viewer, 지정되지 않은 브랜드의 admin)의 화면 처리 — 순수 함수.
// 서버(src/lib/backend/auth/guard.ts)가 최종적으로 막고, 화면은 버튼을 숨기며, 놓친 곳은 아래 규칙으로 쓰기 요청을 막고 안내한다.

/** POST지만 상태를 바꾸지 않는 조회·갱신 요청 — 읽기 전용 사용자도 보낼 수 있다(서버의 guardApi("read")와 같은 목록). */
export const READ_ONLY_POST_ALLOWLIST = ["/api/naver-datalab", "/api/gsc-url-inspection", "/api/pagespeed-insights"];

export const READ_ONLY_MESSAGE = "읽기 전용 권한이라 변경할 수 없어요. 편집이 필요하면 조직 오너에게 요청하세요.";

/** 이 요청이 읽기 전용 사용자에게 막혀야 하는 쓰기 요청인가. */
export function isBlockedForReadOnly(method: string | undefined, url: string): boolean {
  const verb = (method ?? "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return false;
  let path = url;
  try {
    path = new URL(url, "http://local").pathname;
  } catch {
    // 상대 경로 그대로 비교
  }
  if (!path.startsWith("/api/")) return false;
  if (path.startsWith("/api/auth/")) return false; // 로그인·로그아웃·비밀번호 변경은 누구나
  return !READ_ONLY_POST_ALLOWLIST.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}
