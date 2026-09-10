import { HelpArticle, RoadmapGroup } from "../types";

// 데모/쇼케이스에서 "지금은 이렇게 동작하고, 이걸 연결하면 이렇게
// 확장됩니다"를 순서대로 설명할 수 있도록 트리거(무엇을 연결/구축해야
// 열리는지)별로 묶었다. 각 항목은 이 코드베이스에서 실제로 "준비 중"
// 플레이스홀더이거나 mock으로 남아있는 지점과 1:1로 대응한다.
export const roadmapGroups: RoadmapGroup[] = [
  {
    id: "llm-api",
    trigger: "LLM API 연동 시",
    description:
      "지금은 사람이 LLM 채팅창에 직접 물어보고 결과를 코드/화면에 옮겨두는 '수동 다리' 단계입니다. LLM API를 붙이면 이 과정이 전부 배치로 자동화됩니다.",
    items: [
      {
        id: "llm-content-guide",
        title: "기회별 'LLM 기반 수정 가이드' 자동 생성",
        description:
          "콘텐츠 가시성 회복/복잡한 콘텐츠 단순화/FAQ 추가/목차 추가/멀티미디어 보강 — 5개 기회 상세 페이지에 지금 '준비 중'으로 표시된 섹션입니다. LLM API가 붙으면 각 URL의 실제 크롤 결과(원문 HTML)를 근거로 '이 문단을 이렇게 줄이세요', 'FAQ는 이 3개 질문을 추가하세요' 같은 구체적 수정안을 자동 생성해 보여줄 수 있습니다.",
      },
      {
        id: "llm-topic-guide",
        title: "토픽 기회 'LLM 기반 콘텐츠 생성 가이드' 자동 생성",
        description:
          "토픽 기회 상세 페이지의 '준비 중' 섹션. 아직 우리 브랜드가 언급되지 않은 토픽에 대해, 어떤 구조(제목/섹션/FAQ)로 콘텐츠를 만들면 AI 답변에 인용되기 쉬운지 LLM이 초안 가이드를 제안합니다.",
      },
      {
        id: "llm-source-recommendation",
        title: "소스 기회(획득 콘텐츠) 추천 자동화",
        description:
          "지금은 sourceOpportunityRecommendations.ts에 사람이 LLM 응답을 수동으로 붙여넣어 도메인별 추천/근거를 채우고 있습니다. API가 붙으면 인용된 도메인 목록을 자동으로 LLM에 보내 '이 도메인에 어떤 콘텐츠를 기고하면 좋을지'를 배치로 채웁니다.",
      },
      {
        id: "llm-brainstorm-batch",
        title: "프롬프트 전략 'LLM 브레인스토밍' 정기 배치",
        description:
          "가상 사용자 질문(llm_brainstorm) 소스는 현재 한 번 실행한 결과가 고정 저장돼 있습니다. API 연동 시 주간 배치로 자동 재실행해 최신 브랜드 상태를 반영한 새 토픽을 계속 추천할 수 있습니다.",
      },
      {
        id: "llm-sentiment",
        title: "AI 답변 감성 분류 자동화",
        description: "현재 수집된 AI 답변의 감성(우호/중립/비우호) 분류를 LLM 호출로 자동화해 사람이 태깅하지 않아도 되게 합니다.",
      },
    ],
  },
  {
    id: "naver-datalab",
    trigger: "네이버 데이터랩 API 연동 시",
    description: "지금 '검색어 트렌드'는 우리가 직접 수집한 로그 기반 추정치입니다. 데이터랩을 붙이면 실제 검색량 데이터로 바뀝니다.",
    items: [
      {
        id: "datalab-search-volume",
        title: "실제 검색량 기반 키워드 트렌드",
        description: "검색어 트렌드 화면의 순위/추이를 네이버 데이터랩의 실 검색량 지수로 교체합니다.",
      },
      {
        id: "datalab-seasonality",
        title: "카테고리별 계절성 분석",
        description: "업종/카테고리 단위로 검색 관심도의 계절적 변화를 보여줘 콘텐츠 발행 시점을 제안할 수 있습니다.",
      },
    ],
  },
  {
    id: "cdn-analytics",
    trigger: "CDN / Analytics 연동 시",
    description: "브랜드 설정의 CDN·Analytics 카드는 현재 '준비 중' 버튼만 있는 상태입니다. 실 연동이 붙으면 트래픽 지표가 실측으로 바뀝니다.",
    items: [
      {
        id: "agentic-traffic-real",
        title: "에이전틱 트래픽 실측",
        description: "개요의 '트래픽 추이'가 지금은 mock입니다. CDN/엣지 로그를 연결하면 AI 에이전트가 실제로 보낸 요청 수를 실측치로 보여줍니다.",
      },
      {
        id: "referral-traffic-real",
        title: "LLM 리퍼럴 트래픽 실측",
        description: "AI 답변 속 인용 링크를 클릭해 유입된 실제 사용자 트래픽을 Analytics 연동으로 집계합니다.",
      },
    ],
  },
  {
    id: "community-api",
    trigger: "Reddit / YouTube / Wikipedia API 연동 시",
    description: "커뮤니티/영상 플랫폼에서의 브랜드 언급은 각 플랫폼 API 키가 있어야 진단할 수 있어 현재 범위에서 제외돼 있습니다.",
    items: [
      {
        id: "community-sentiment",
        title: "커뮤니티 언급 감성 분석",
        description: "Reddit/유튜브 댓글 등에서의 브랜드 언급을 수집해 감성을 분석하고 '기회' 목록에 오프사이트 기회로 추가합니다.",
      },
    ],
  },
  {
    id: "auth-and-org",
    trigger: "회원가입/로그인 체계 구축 시",
    description:
      "지금은 로그인 없이 조직 하나(Neodigm)만 고정으로 보여주는 단일 사용자 데모 구조입니다. 회원 체계가 들어가면 여러 조직/여러 사용자가 각자 권한에 맞는 화면만 보게 됩니다.",
    items: [
      {
        id: "auth-signup-login",
        title: "회원가입 / 로그인 / 회원 관리 / 회원 탈퇴",
        description: "이메일 또는 SSO 기반 회원가입·로그인과, 마이페이지에서의 정보 수정·탈퇴 플로우를 추가합니다.",
      },
      {
        id: "auth-roles",
        title: "유저 권한 체계",
        description: "조직 내에서 관리자/편집자/뷰어 같은 역할을 나눠 브랜드 설정·연동 관리 같은 민감한 액션을 권한별로 제한합니다.",
      },
      {
        id: "auth-org-assignment",
        title: "조직 할당",
        description: "가입한 사용자를 하나 이상의 조직에 소속시키고, 지금 상단의 조직/브랜드 전환 스위처가 실제 소속 조직 목록을 반영하도록 바꿉니다.",
      },
      {
        id: "auth-org-brand-rbac-audit",
        title: "조직-권한-브랜드 기준 페이지 렌더링 재검증",
        description: "회원 체계가 반영된 뒤, 모든 화면이 로그인한 사용자의 조직·권한·선택된 브랜드 기준으로 올바른 데이터만 보여주는지 전체 페이지를 다시 점검합니다 — 지금은 DEFAULT_ORG_ID 하나로 고정돼 있어 이 검증 자체가 아직 의미가 없습니다.",
      },
    ],
  },
  {
    id: "notifications",
    trigger: "알림/이메일 발송 인프라 구축 시",
    description: "상단의 알림(종 모양) 아이콘은 지금 클릭해도 아무 동작이 없는 자리만 있는 상태입니다. 알림 인프라가 붙으면 실제로 이벤트를 받고 이메일로도 전달받을 수 있습니다.",
    items: [
      {
        id: "notif-in-app",
        title: "인앱 알림",
        description: "새 기회 발견, 재색인 완료, 브랜드 상태 전환 같은 이벤트를 상단 알림 아이콘에서 실시간으로 확인할 수 있게 합니다.",
      },
      {
        id: "notif-email-log",
        title: "이메일로 알림 로그 발송",
        description: "발생한 알림을 모아 정기적으로(또는 즉시) 이메일로 발송하는 배치를 구축합니다 — 담당자가 대시보드에 매번 접속하지 않아도 주요 변화를 놓치지 않게 합니다.",
      },
    ],
  },
  {
    id: "db-migration",
    trigger: "DB 구축 및 마이그레이션",
    description:
      "지금은 별도 DB 없이 .tmp 폴더의 파일(추적 토픽, 크롤 기록, 브랜드 CRUD, 삭제된 라이브러리 행 등)로 상태를 관리하고 있습니다. 1인/1조직 데모에는 충분하지만, 실 서비스로 넘어가려면 아래 전환이 필요합니다.",
    items: [
      {
        id: "db-real-store",
        title: "파일 기반 저장소 → 실 DB 전환",
        description: "브랜드/카테고리/추적 토픽/크롤 기록/제외 목록 등 .tmp/*.json으로 관리 중인 모든 상태를 Postgres 등 실 DB 테이블로 옮깁니다.",
      },
      {
        id: "db-multi-tenant",
        title: "다중 조직·다중 사용자 지원",
        description: "현재 DEFAULT_ORG_ID 하나로 고정된 구조를 실제 여러 조직/여러 사용자가 각자의 데이터를 갖도록 확장합니다.",
      },
      {
        id: "db-concurrency",
        title: "동시 편집 충돌 방지",
        description: "파일 쓰기 기반이라 동시에 두 사람이 같은 브랜드를 수정하면 마지막에 쓴 값이 이긴다. DB 트랜잭션으로 안전하게 바꿉니다.",
      },
      {
        id: "db-backup",
        title: "백업/복구 체계",
        description: "파일이 곧 데이터인 지금 구조는 서버가 재배포되면 날아갈 수 있습니다. DB로 옮기면 표준 백업/복구 절차를 적용할 수 있습니다.",
      },
    ],
  },
];

// 실 유저가 소비하는 도움말 — 카드 목록 → 상세 페이지 흐름.
export const helpArticles: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "네오디오 처음 시작하기",
    category: "시작하기",
    summary: "대시보드 구조와 왼쪽 메뉴가 어떻게 구성돼 있는지 먼저 살펴보세요.",
    content: [
      "네오디오는 우리 브랜드가 ChatGPT, Gemini 같은 생성형 AI의 답변에 얼마나, 어떻게 등장하는지를 추적하고 개선하는 대시보드입니다.",
      "왼쪽 메뉴는 크게 5개 영역으로 나뉩니다 — AI 가시성(수집된 데이터를 보는 곳), 프롬프트 관리(무엇을 추적할지 정하는 곳), 브랜드 관리(추적 대상 설정), 도메인(우리 사이트 진단), 기회(개선할 항목과 수정 흐름).",
      "가장 먼저 확인할 화면은 '개요'입니다. 콘텐츠 가시성, 가시성 점수, 브랜드 언급/인용 수, 최근 발견된 기회를 한눈에 보여줍니다.",
    ],
    highlights: ["왼쪽 메뉴 = 5개 영역", "첫 화면은 '개요'에서 시작", "각 화면 상단의 '어떻게 동작하나요' 배너를 먼저 읽어보세요"],
    relatedHref: "/",
    relatedLabel: "개요 화면 열기",
  },
  {
    slug: "visibility-overview",
    title: "가시성 개요 읽는 법",
    category: "AI 가시성",
    summary: "우리 브랜드가 어떤 프롬프트에서, 어떤 모델에서 언급/인용됐는지 확인하는 화면입니다.",
    content: [
      "가시성 개요는 실제로 실행한 프롬프트(수집 로그)를 토픽 단위로 묶어 보여줍니다.",
      "'상위 프롬프트'는 우리 브랜드가 언급된 프롬프트, '토픽 기회'는 아직 언급되지 않은 프롬프트입니다 — 토픽 기회는 '기회' 메뉴의 토픽 기회 상세로 이어집니다.",
      "'인용된 페이지/소스' 탭은 AI 답변이 실제로 어떤 URL·도메인을 근거로 들었는지 집계한 것으로, 우리 콘텐츠가 인용되고 있는지 경쟁사 콘텐츠가 더 많이 인용되는지 비교할 수 있습니다.",
    ],
    highlights: ["상위 프롬프트 vs 토픽 기회", "인용된 페이지/소스로 경쟁 구도 파악"],
    relatedHref: "/visibility-overview",
    relatedLabel: "가시성 개요 열기",
  },
  {
    slug: "prompt-strategy",
    title: "프롬프트 전략으로 다음 토픽 정하기",
    category: "프롬프트 관리",
    summary: "Google Search Console과 LLM 인사이트를 근거로 다음에 추적할 프롬프트를 추천받습니다.",
    content: [
      "프롬프트 전략은 두 가지 소스에서 추천을 만듭니다 — 우리 사이트가 이미 검색 노출을 받고 있는 GSC 키워드, 그리고 매주 LLM에게 현재 데이터를 기반으로 물어보는 인사이트 브레인스토밍입니다.",
      "카드를 눌러 그룹으로 이동한 뒤, 체크박스로 원하는 프롬프트만 선택해 '선택 추적'하거나 그룹 전체를 '전체 추적'할 수 있습니다.",
      "추적을 누르면 프롬프트 라이브러리에 실제로 추가되고, 이후 수집 로그를 통해 실제 AI 답변에서 추적이 시작됩니다.",
    ],
    highlights: ["GSC 소스 vs LLM 브레인스토밍 소스", "체크박스로 선택 추적 가능", "추적 = 프롬프트 라이브러리에 추가"],
    relatedHref: "/prompt-strategy",
    relatedLabel: "프롬프트 전략 열기",
  },
  {
    slug: "prompt-library",
    title: "프롬프트 라이브러리 관리하기",
    category: "프롬프트 관리",
    summary: "지금 추적 중인 모든 프롬프트를 카테고리별로 보고, 새 프롬프트를 추가하거나 CSV로 가져올 수 있습니다.",
    content: [
      "프롬프트 라이브러리는 우리가 추적하기로 정한 모든 프롬프트의 목록입니다. 출처(직접 입력/AI 생성/CSV 가져오기)와 관계없이 여기 모입니다.",
      "카테고리/서브카테고리로 필터링해 특정 주제의 프롬프트만 모아볼 수 있습니다.",
      "브랜디드/언브랜디드 비율과 토픽 의도 일치도 카드는 추적 중인 프롬프트 구성이 균형 잡혀 있는지 보여주는 건강도 지표입니다.",
    ],
    highlights: ["출처와 무관하게 한 곳에 모임", "브랜디드/언브랜디드 비율로 건강도 확인"],
    relatedHref: "/prompt-library",
    relatedLabel: "프롬프트 라이브러리 열기",
  },
  {
    slug: "brand-presence",
    title: "브랜드 가시성으로 경쟁사와 비교하기",
    category: "브랜드 관리",
    summary: "우리 브랜드와 주요 경쟁사의 언급/인용 수를 마켓별로 비교합니다.",
    content: [
      "마켓 트래킹 차트는 선택한 기간 동안 브랜드별 주간 언급/인용 수 추이를 보여줍니다.",
      "감성 무버(개선/하락 상위 항목)는 최근 감성이 크게 바뀐 토픽을 짚어줘, 어떤 대화에서 우리 브랜드 평판이 좋아지거나 나빠지고 있는지 빠르게 파악할 수 있습니다.",
    ],
    highlights: ["마켓별 비교", "감성 무버로 급격한 변화 포착"],
    relatedHref: "/brand-presence",
    relatedLabel: "브랜드 가시성 열기",
  },
  {
    slug: "url-inspector",
    title: "URL 인스펙터로 특정 페이지 점검하기",
    category: "도메인",
    summary: "우리 사이트의 특정 URL이 AI 답변에 얼마나 인용되고 있는지 확인합니다.",
    content: [
      "URL을 입력하면 해당 페이지가 지금까지 수집된 AI 답변에서 몇 번 인용됐는지, 어떤 프롬프트에서 인용됐는지 보여줍니다.",
      "새 콘텐츠를 발행한 뒤 이 화면으로 실제 인용 여부를 추적하면, '기회' 메뉴의 콘텐츠 인용 트래킹과 같은 데이터를 다른 각도에서 확인할 수 있습니다.",
    ],
    relatedHref: "/url-inspector",
    relatedLabel: "URL 인스펙터 열기",
  },
  {
    slug: "opportunities",
    title: "기회 — 발견부터 수정 확인까지",
    category: "기회",
    summary: "실제 크롤/수집 데이터로 발견한 개선 기회를 확인하고, 수정 후 재크롤로 검증하는 흐름입니다.",
    content: [
      "'기회'는 온사이트 콘텐츠 최적화(복잡도/FAQ/목차/멀티미디어/콘텐츠 가시성 회복)와 온사이트 기술 최적화(robots.txt)로 나뉩니다. 각 카드의 오른쪽 상태값이 지금 몇 개 URL이 수정 필요한지 보여줍니다.",
      "카드에 들어가면 URL별로 현재 점수와 우선순위를 보고, 콘텐츠를 수정한 뒤 '재색인' 버튼으로 그 URL만 다시 크롤링해 기준을 통과했는지 실측으로 확인할 수 있습니다.",
      "해당 없는 URL은 '제외' 처리해 수정 필요 목록에서 뺄 수 있고, 언제든 '제외됨' 탭에서 다시 포함시킬 수 있습니다.",
      "여러 URL을 한 번에 고쳤다면 체크박스로 선택해 '선택 재색인'을, 전부 고쳤다면 '전체 재색인'을 눌러 한 번의 크롤 작업으로 일괄 검증할 수 있습니다.",
    ],
    highlights: ["카드 → URL 목록 → 재색인으로 검증", "제외/다시 포함으로 목록 정리", "선택/전체 재색인으로 일괄 검증"],
    relatedHref: "/opportunities",
    relatedLabel: "기회 목록 열기",
  },
  {
    slug: "brands-management",
    title: "브랜드 설정에서 추적 대상 관리하기",
    category: "브랜드 관리",
    summary: "추적할 브랜드를 추가/편집/삭제하고, 프롬프트 카테고리를 관리합니다.",
    content: [
      "'브랜드 추가'로 새 브랜드를 등록하면 '대기 중' 상태로 시작합니다. 도메인 정보를 채우고 나면 브랜드 상세 페이지에서 '활성 상태로 전환'할 수 있습니다.",
      "브랜드 상세 페이지에서 이름/사이트맵 URL/설명/마켓 같은 기본 정보와 별칭·기타 브랜드·소셜 계정·획득 콘텐츠 소스를 관리합니다. 사이트맵 URL을 입력하면 그 자리에서 '사이트맵 크롤'을 실행해 콘텐츠 가시성을 측정할 수 있습니다.",
      "카테고리 섹션의 '프롬프트 수'는 실제 프롬프트 라이브러리에 있는 프롬프트 개수를 그대로 보여줍니다.",
    ],
    highlights: ["대기 중 → 활성 전환", "사이트맵 크롤로 콘텐츠 가시성 측정", "카테고리별 프롬프트 수는 실 데이터"],
    relatedHref: "/brands-management",
    relatedLabel: "브랜드 설정 열기",
  },
  {
    slug: "connect-gsc",
    title: "Google Search Console 연동하기",
    category: "연동",
    summary: "GSC를 연결하면 실제 검색 노출/클릭 데이터를 프롬프트 전략과 개요 체크리스트에 활용합니다.",
    content: [
      "브랜드 상세 → '연결 관리'에서 Google 계정으로 GSC를 연결할 수 있습니다.",
      "연결되면 우리 사이트가 이미 노출되고 있는 검색어를 프롬프트 전략의 'GSC 커버리지 공백' 추천에 활용하고, 개요의 체크리스트 진행 상태에도 반영됩니다.",
      "연결을 해제하면 관련 화면은 자동으로 mock 또는 '연결 필요' 상태로 되돌아갑니다.",
    ],
    relatedHref: "/brands-management",
    relatedLabel: "브랜드 설정에서 연결 관리 열기",
  },
  {
    slug: "pricing",
    title: "요금제 안내",
    category: "요금제",
    summary: "플랜별로 지원하는 기능과 가격을 안내합니다. (콘텐츠 준비 중)",
    content: [
      "네오디오의 플랜별 기능/가격 정보는 아직 준비 중입니다.",
      "지금 이 화면의 기능들(가시성 개요, 프롬프트 전략/라이브러리, 브랜드 가시성, URL 인스펙터, 기회, 브랜드 설정)은 모두 하나의 플랜 기준으로 동작합니다. 플랜이 확정되면 이 페이지에 플랜별 지원 기능과 가격 비교표가 추가됩니다.",
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | null {
  return helpArticles.find((a) => a.slug === slug) ?? null;
}
