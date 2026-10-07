import type { Metadata } from "next";
import { LegalLayout, LegalList, LegalSection } from "@/components/legal/LegalLayout";
import { CONTACT_EMAIL, LEGAL_EFFECTIVE_DATE, OPERATOR_NAME, SERVICE_NAME } from "@/lib/legal";

export const metadata: Metadata = { title: "개인정보처리방침 · Neodio" };

export default function PrivacyPage() {
  return (
    <LegalLayout title="개인정보처리방침" updated={LEGAL_EFFECTIVE_DATE}>
      <p>{OPERATOR_NAME}(이하 “회사”)은 {SERVICE_NAME} 서비스를 제공하면서 필요한 최소한의 정보만 처리하며, 아래와 같이 안내합니다.</p>

      <LegalSection title="1. 처리하는 정보">
        <LegalList items={[
          <><b>계정 정보</b> — 로그인 아이디, 이름, 비밀번호(복원할 수 없는 해시 값으로만 저장), 소속 조직과 역할·접근 가능한 브랜드</>,
          <><b>이용 기록</b> — 로그인·로그아웃 시각과 접속 기기(브라우저) 정보, 로그인 시도 제한을 위한 접속 IP와 실패 횟수, 설정 변경 이력(누가 언제 무엇을 바꿨는지)</>,
          <><b>고객이 입력한 정보</b> — 브랜드명·도메인, 경쟁사, 추적할 질문(프롬프트), 보고서 내용</>,
          <><b>수집한 AI 답변</b> — 등록한 질문을 AI 서비스에 물어 얻은 공개 답변과 인용 출처. 개인의 사적인 대화가 아닙니다.</>,
          <><b>Google 연동 시 정보</b> — 아래 3항 참고</>,
        ]} />
      </LegalSection>

      <LegalSection title="2. 이용 목적">
        <LegalList items={[
          "로그인과 조직·브랜드별 접근 권한 관리, 무단 접근 방지",
          "브랜드 가시성 지표 계산, 대시보드와 보고서 제공",
          "서비스 안정성 확보와 오류 대응, 설정 변경 이력 제공",
        ]} />
        <p>정보를 광고에 쓰거나 제3자에게 판매하지 않습니다.</p>
      </LegalSection>

      <LegalSection title="3. Google 사용자 데이터">
        <p>고객이 브랜드의 연결 화면에서 직접 허용한 경우에만 Google 계정에 연결하며, 다음 권한을 요청합니다.</p>
        <LegalList items={[
          <><code>https://www.googleapis.com/auth/webmasters.readonly</code> — Search Console 데이터를 <b>읽기 전용</b>으로 조회합니다(검색어, 페이지, 클릭·노출·평균 순위, 사이트맵·URL 검사·리치 결과 상태). 데이터를 수정하거나 삭제하지 않습니다.</>,
          <><code>openid</code>, <code>https://www.googleapis.com/auth/userinfo.email</code> — 어느 Google 계정으로 연결했는지 화면에 보여 주기 위해 계정 이메일 주소를 확인합니다.</>,
        ]} />
        <p><b>사용 범위.</b> 가져온 데이터는 연결한 브랜드의 검색 성능·색인 상태를 해당 조직의 대시보드에 보여 주는 목적으로만 사용합니다. 계정 이메일은 연결 상태 표시에만 사용합니다.</p>
        <p><b>저장.</b> 연결을 유지하기 위한 갱신 토큰(refresh token)과 연결한 계정 이메일, URL 검사 결과 캐시를 회사의 데이터베이스에 저장합니다. 갱신 토큰은 서버에서만 사용하며 화면이나 브라우저로 내려보내지 않습니다. 검색 성능 데이터는 조회할 때 Google에서 가져와 화면에 표시합니다.</p>
        <p><b>공유 제한.</b> 법령상 요구되는 경우를 제외하고 Google 사용자 데이터를 제3자에게 제공·판매하지 않으며, 광고 목적으로 사용하지 않고, 일반적인 AI·머신러닝 모델을 개발하거나 학습시키는 데 사용하지 않습니다. 사람이 이 데이터를 열람하는 경우는 사용자의 동의를 받았거나 보안·법령 준수에 필요한 때로 한정합니다. 사용자가 대시보드의 AI 제안 기능을 직접 실행하면, 사용자가 선택한 검색어가 제안을 만들기 위해 AI 모델 API로 전달될 수 있습니다.</p>
        <p><b>연결 해제와 삭제.</b> 브랜드 관리의 연결 화면에서 언제든 연결을 해제할 수 있으며, 해제하면 저장된 갱신 토큰을 삭제합니다. Google 계정의 <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">앱 액세스 관리</a>에서도 권한을 취소할 수 있습니다. 그 외 삭제 요청은 아래 문의처로 보내 주세요.</p>
        <p>네오디오의 Google API 정보 사용과 다른 앱으로의 전송은 제한적 사용(Limited Use) 요건을 포함한 <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API 서비스 사용자 데이터 정책</a>을 준수합니다.</p>
      </LegalSection>

      <LegalSection title="4. 처리 위탁과 제3자 서비스">
        <p>서비스 제공을 위해 다음 서비스를 이용하며, 필요한 범위의 정보만 전달됩니다.</p>
        <LegalList items={[
          "Vercel — 웹 서비스 호스팅",
          "Neon — 데이터베이스",
          "Google — 로그인 연동(Search Console)과 AI 모델 API(AI 제안 기능, 사용자가 실행할 때)",
          "각 AI·검색 서비스 — 등록한 질문을 보내 공개 답변을 수집",
        ]} />
      </LegalSection>

      <LegalSection title="5. 보관과 삭제">
        <p>계정과 조직 데이터는 이용 계약 기간 동안 보관하며, 계정 삭제나 계약 종료 후 요청이 있으면 지체 없이 삭제합니다. 변경 이력과 접속 기록은 보안과 문제 추적을 위해 필요한 기간 보관합니다. 로그인 시도 제한 정보는 짧은 시간 뒤 의미를 잃으며 필요 이상으로 보관하지 않습니다.</p>
      </LegalSection>

      <LegalSection title="6. 보안">
        <LegalList items={[
          "비밀번호는 단방향 해시로만 저장하고, 로그인 세션 토큰은 해시로만 저장합니다.",
          "조직·브랜드별 접근 권한을 서버에서 검사하며, 읽기 전용 구성원은 데이터를 변경할 수 없습니다.",
          "반복된 로그인 실패를 제한하고, 전송 구간은 HTTPS로 보호합니다.",
        ]} />
      </LegalSection>

      <LegalSection title="7. 이용자의 권리">
        <p>이용자는 자신의 정보에 대한 열람·정정·삭제·처리 정지를 요청할 수 있습니다. 이름은 서비스 안의 “내 정보 수정”에서 직접 바꿀 수 있고, 그 밖의 요청은 소속 조직 관리자 또는 아래 문의처로 보내 주세요.</p>
      </LegalSection>

      <LegalSection title="8. 문의">
        <p>{OPERATOR_NAME} 개인정보 문의{CONTACT_EMAIL ? `: ${CONTACT_EMAIL}` : " — 계약 시 안내된 담당자 연락처로 문의해 주세요."}</p>
      </LegalSection>

      <LegalSection title="9. 방침의 변경">
        <p>이 방침이 바뀌면 이 페이지에 변경 내용과 시행일을 알립니다.</p>
      </LegalSection>
    </LegalLayout>
  );
}
