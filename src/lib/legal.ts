// 공개 페이지(소개·개인정보처리방침·서비스 약관) 공통 값 — Google OAuth 동의 화면에 등록하는 주소가 이 페이지들이다.
export const SERVICE_NAME = "네오디오(Neodio)";
export const OPERATOR_NAME = "네오다임(Neodigm)";
export const LEGAL_EFFECTIVE_DATE = "2026년 10월 7일";
/** 문의 이메일 — 배포 환경변수 NEXT_PUBLIC_CONTACT_EMAIL로 정한다. 없으면 안내 문구만 보인다. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

export const PUBLIC_PAGES = [
  { href: "/about", label: "서비스 소개" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "서비스 약관" },
] as const;
