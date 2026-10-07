import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalList, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/legal";

export const metadata: Metadata = { title: "서비스 소개 · Neodio", description: "생성형 AI 답변 속 브랜드 가시성을 추적하고 개선하는 대시보드, 네오디오" };

export default function AboutPage() {
  return (
    <LegalLayout title="네오디오(Neodio) — 생성형 AI 속 브랜드 가시성 대시보드">
      <p>
        네오디오는 우리 브랜드가 ChatGPT, Gemini, Claude, Perplexity, 네이버 AI 검색, 구글 AI 모드 같은 생성형 AI의 답변에 얼마나, 어떻게 등장하는지 추적하고 개선하는 서비스입니다. {OPERATOR_NAME}이 운영합니다.
      </p>
      <LegalSection title="무엇을 할 수 있나요">
        <LegalList items={[
          "브랜드와 경쟁사가 AI 답변에서 언급·인용되는 비율, 노출 위치, 가시성 점수 추이 확인",
          "추적할 질문(프롬프트)을 정하고 여러 AI 엔진에서 정기적으로 수집",
          "AI가 자주 인용하는 출처와 우리 사이트의 인용 현황 분석",
          "Google Search Console을 연결해 검색 성능과 URL 색인 상태를 함께 확인(연결은 고객이 직접 허용한 경우에만)",
          "고객에게 전달할 수 있는 리포트(PDF) 작성",
        ]} />
      </LegalSection>
      <LegalSection title="Google 계정 연동에 대해">
        <p>
          Search Console 연동은 고객이 직접 Google 계정으로 허용했을 때만 동작하며, 읽기 전용 권한으로 검색 성능과 URL 검사 정보를 조회해 대시보드에 보여 주는 데만 씁니다. 자세한 내용은{" "}
          <Link href="/privacy" className="underline">개인정보처리방침</Link>을 참고하세요.
        </p>
      </LegalSection>
      <LegalSection title="이용 방법">
        <p>네오디오는 계약한 조직의 구성원에게 발급된 계정으로 이용합니다. 계정이 필요하면 소속 조직의 관리자나 {OPERATOR_NAME} 담당자에게 요청해 주세요.{CONTACT_EMAIL ? ` 문의: ${CONTACT_EMAIL}` : ""}</p>
        <p><Link href="/login" className="font-semibold underline">로그인하러 가기</Link></p>
      </LegalSection>
    </LegalLayout>
  );
}
