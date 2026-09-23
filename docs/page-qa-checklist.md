# 페이지별 QA 체크리스트

2026-09-23 로컬 dev 환경에서 22개 라우트 전체를 순회하며 점검한 기록.
앞으로 큰 변경 후 재점검할 때 이 표를 갱신한다. 항목: 콘솔 에러 없음 /
링크 정상 / 눈에 띄는 버그 없음.

## 점검 프롬프트 (복사해서 사용)

```
docs/page-qa-checklist.md 아래 표의 각 페이지를 로컬 dev에서 하나씩 열어서
콘솔 에러, 네트워크 실패, 화면 깨짐, 텍스트 오타/부자연스러운 조사(은/는·
이/가)를 확인해줘. 확인 전에 .next 캐시를 지우고 dev 서버를 재시작해줘 —
파일 컨벤션이 바뀐 뒤(예: middleware→proxy) 캐시가 낡은 에러를 보여준 적이
있어. 페이지 이동은 링크를 실제로 클릭해서 하고(URL 직접 입력만으로는
끊어진 nav 링크를 못 잡음), 발견한 문제는 심각도(P0/P1/P2)와 함께 표를
갱신해줘.
```

## 결과 (2026-09-23)

| 페이지 | 콘솔 에러 | 비고 |
|---|---|---|
| `/` (개요) | ✅ | 실 데이터 정상 표시 |
| `/visibility-overview` | ✅ | |
| `/prompt-research` | ✅ | "준비 중" 플레이스홀더, 정직하게 표시됨 |
| `/search-trend` | ✅ | mock 데이터임을 배너로 명시 — 아래 "확인 필요" 참고 |
| `/search-performance` | ✅ | 로컬은 GSC 미연결 상태라 안내 화면(정상) |
| `/collection-runs` | ✅ | 실제 수집 시작→중단까지 실동작 검증 완료 |
| `/prompt-strategy` | ✅ | |
| `/prompt-library` | ✅ | |
| `/brand-presence` | ✅ | **오타 발견·수정**: "가시성는"→"가시성은" |
| `/url-inspector` | ✅ | |
| `/opportunities` | ✅ | 4개 콘텐츠 최적화 카드가 전부 "20개"인 건 버그 아님 — 같은 크롤 URL 집합을 4개 기준으로 나눠 보는 것 |
| `/opportunities/complexity` | ✅ | |
| `/opportunities/content-recovery` | ✅ | |
| `/opportunities/faq` | ✅ | |
| `/opportunities/multimedia` | ✅ | |
| `/opportunities/robots-txt` | ✅ | 실제 robots.txt 라이브 fetch 확인 |
| `/opportunities/toc` | ✅ | |
| `/opportunities/topic/[topic]` | ✅ | 동적 라우트 정상 |
| `/brands-management` | ✅ | |
| `/brands-management/[brandId]` | ✅ | 별칭 저장 토스트 등 이전 세션에서 검증 완료 |
| `/brands-management/[brandId]/connections` | ✅ | GSC 연결 링크 왕복 정상 |
| `/help` | ✅ | |
| `/help/[slug]` | ✅ | 실제 콘텐츠, 더미 아님 |

## 발견 및 조치

- **수정함**: `BrandPresenceClient.tsx`의 조사 오타 "가시성는" → "가시성은".
- **수정함**: `src/proxy.ts` — named export(`export function proxy`)가
  `next dev`에서 간헐적으로 "Proxy is missing expected function export
  name" 500 에러를 냈다. `.next` 캐시를 지우고 재시작해도 재현돼서
  `export default function proxy`로 바꿔 해결. (프로덕션 `next build`에서는
  둘 다 정상이었던 걸로 보아 dev 전용 Turbopack 캐시 이슈로 추정.)
- **확인 필요(제품 판단)**: `/search-trend`가 "아래 그래프는 화면 구조
  검증용 mock 데이터입니다"라고 사용자에게 직접 노출한다. 이건
  memory에 있는 "UI 텍스트에 내부 구현 상태 노출 금지" 원칙과 배치될 수
  있음 — 다만 "API 연동 전"이라는 사실을 사용자에게 투명하게 알리는
  용도라 의도된 것일 수도 있다. `/prompt-research`도 같은 패턴("이 기능은
  준비 중입니다"). 데모 화면으로 쓸 계획이면 이 문구들을 다시 검토할 것.

## 정적 스캔 (기계적 확인, 전부 클린)

- `TODO`/`FIXME`/`XXX:` 주석: 없음
- 디버그용 `console.log(`: 없음 (전부 의도된 `console.error`)
- 주석 처리된 죽은 코드 블록: 없음
- 내부 `href`(정적 문자열 + 데이터 소스의 동적 href) 전수 대조: 존재하지
  않는 라우트를 가리키는 링크 없음 (Sidebar, 도움말 관련 글, 개요
  체크리스트 전부 확인)

## 범위 밖 (이번엔 다루지 않음)

- 실제 사이트맵 크롤/AI 수집 버튼의 라이브 클릭 테스트는 로컬에서도
  무겁고 느려서(실제 Playwright 브라우저 실행) 스킵 — API 계약과 취소
  흐름은 이전 세션에서 curl/실제 프로세스로 검증 완료.
- CSV 가져오기/내보내기, 브랜드 별칭 병합(브릿지) 등 모달 안쪽까지 전부
  펼쳐서 버튼 하나하나 누르는 딥 클릭은 생략 — 페이지 로드/네비게이션
  레벨 점검에 집중.
