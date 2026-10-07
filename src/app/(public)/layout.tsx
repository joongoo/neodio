// 로그인 없이 열리는 공개 페이지(소개·개인정보처리방침·서비스 약관) — 앱 헤더·사이드바가 없다.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
