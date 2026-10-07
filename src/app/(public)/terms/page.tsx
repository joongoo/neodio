import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalList, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_NAME, SERVICE_NAME } from "@/lib/legal";

export const metadata: Metadata = { title: "서비스 약관 · Neodio" };

export default function TermsPage() {
  return (
    <LegalLayout title="서비스 약관" updated={LEGAL_EFFECTIVE_DATE}>
      <LegalSection title="1. 목적과 적용">
        <p>이 약관은 {OPERATOR_NAME}(이하 “회사”)이 제공하는 {SERVICE_NAME}(이하 “서비스”)의 이용 조건과 회사·이용자의 권리와 책임을 정합니다. 서비스를 이용하면 이 약관에 동의한 것으로 봅니다.</p>
      </LegalSection>

      <LegalSection title="2. 서비스 내용">
        <p>서비스는 생성형 AI 답변 속 브랜드의 언급·인용 현황을 수집·분석해 대시보드와 보고서로 보여 주고, 연동한 Google Search Console 데이터를 함께 보여 줍니다. 회사는 서비스의 일부를 바꾸거나 중단할 수 있으며, 중요한 변경은 미리 알립니다.</p>
      </LegalSection>

      <LegalSection title="3. 계정과 권한">
        <LegalList items={[
          "계정은 아이디와 비밀번호로 이용하며, 조직 오너·관리자 또는 회사 담당자가 발급하거나 권한을 부여합니다.",
          "역할(오너·admin·유저)에 따라 볼 수 있는 조직·브랜드와 변경 권한이 다릅니다.",
          "이용자는 자신의 계정과 비밀번호를 안전하게 관리해야 하며, 타인에게 공유하거나 양도할 수 없습니다. 도용이 의심되면 즉시 비밀번호를 바꾸고 관리자에게 알려 주세요.",
        ]} />
      </LegalSection>

      <LegalSection title="4. 이용자의 책임">
        <LegalList items={[
          "서비스를 법령과 이 약관에 맞게 이용해야 하며, 서비스·서버에 대한 무단 접근, 과도한 자동 요청, 데이터 변조를 해서는 안 됩니다.",
          "입력한 브랜드·경쟁사·질문 등 정보에 대해 필요한 권리를 갖고 있어야 합니다.",
          "Google 계정 연동은 해당 사이트의 Search Console 접근 권한이 있는 사람이 하며, 권한 없는 사이트의 데이터를 연결해서는 안 됩니다.",
        ]} />
      </LegalSection>

      <LegalSection title="5. 데이터와 지표에 대한 안내">
        <p>AI 답변은 같은 질문에도 시점과 엔진에 따라 달라질 수 있으며, 서비스의 지표는 설정한 질문 묶음과 수집 시점을 기준으로 한 추정치입니다. 회사는 지표가 특정 매출·순위·검색 결과를 보장한다고 약속하지 않으며, 이용자의 의사결정에 따른 결과에 대해서는 법령이 허용하는 범위에서 책임을 제한합니다. 지표의 정의와 한계는 보고서 부록과 도움말에서 설명합니다.</p>
      </LegalSection>

      <LegalSection title="6. 지식재산권">
        <p>서비스와 그 화면·소프트웨어에 대한 권리는 회사에 있습니다. 이용자가 입력한 정보와 이용자 조직의 데이터에 대한 권리는 이용자(조직)에게 있으며, 회사는 서비스를 제공하는 데 필요한 범위에서만 이를 사용합니다.</p>
      </LegalSection>

      <LegalSection title="7. 이용 제한과 종료">
        <p>이용자가 약관을 위반하거나 서비스의 안정성을 해치면 회사는 계정 이용을 제한하거나 중지할 수 있습니다. 이용자는 언제든 이용을 종료하고 계정·데이터 삭제를 요청할 수 있으며, 처리 방법은 <Link href="/privacy" className="underline">개인정보처리방침</Link>을 따릅니다.</p>
      </LegalSection>

      <LegalSection title="8. 면책과 책임 제한">
        <p>회사는 천재지변, 외부 서비스(AI·검색·클라우드·Google 등)의 장애나 정책 변경 등 회사가 통제할 수 없는 사유로 인한 서비스 장애에 대해 책임을 지지 않습니다. 서비스는 있는 그대로 제공되며, 회사의 고의 또는 중대한 과실이 없는 한 간접·특별 손해에 대해 책임을 지지 않습니다.</p>
      </LegalSection>

      <LegalSection title="9. 약관의 변경과 문의">
        <p>약관이 바뀌면 이 페이지에 변경 내용과 시행일을 알립니다. 변경 후 계속 이용하면 변경에 동의한 것으로 봅니다. 문의{CONTACT_EMAIL ? `: ${CONTACT_EMAIL}` : " — 계약 시 안내된 담당자 연락처로 문의해 주세요."}</p>
      </LegalSection>
    </LegalLayout>
  );
}
