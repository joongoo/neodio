# 02. ARCHITECTURE_ANALYSIS — geo-aeo-tracker @ 4858dec

## 1. 구조

```
Next.js 16 단일 앱
├─ app/page.tsx → components/sovereign-dashboard.tsx   (상태·탭·KPI 전부 한 클라이언트 컴포넌트, 약 2천 줄)
├─ app/api/*           (scrape, analyze, audit, serp, site-context, unlocker, bulk-sro, rank-signal, state ...)
├─ lib/client/         (IndexedDB 저장소, SSE 클라이언트)
├─ lib/server/         (Bright Data, OpenRouter, Gemini, SSRF, robots, rank-signal-*)
├─ lib/scoring.ts      (브랜드 매칭·감성·점수: 순수 함수)
├─ lib/shared/         (rank-signal 통계: 서버·클라이언트 공용 순수 함수)
├─ proxy.ts            (IP 레이트리밋 + 데모 에이전트 디스커버리)
└─ supabase/migrations/001_kv_store.sql   (테이블 1개)
```

## 2. 데이터 흐름

1. 사용자가 브라우저에서 프롬프트 × 엔진 조합 선택(배치는 풀로 4개씩 동시 실행: `lib/pool.ts`)
2. `/api/scrape` → Bright Data에 요청 → 응답이 즉시 안 오면 `snapshot_id`를 받아 **폴링**(`brightdata-scraper.ts` 모니터/다운로드 단계) → 정규화
3. 답변 본문에서 URL 추출 + 응답의 `citations`/`links_attached`/`sources` 필드 병합·중복 제거
4. **점수·감성 계산은 클라이언트**에서 수행(`lib/scoring.ts`), 결과 전체가 `AppState` JSON 한 덩어리로 IndexedDB(또는 KV)에 저장
5. 자동 실행은 대시보드 컴포넌트 안의 인터벌 타이머 + 직전 점수 대비 변화량이 임계값 이상이면 드리프트 알림 생성

## 3. 저장·격리·인증

| 항목 | 현황 | 근거 |
|---|---|---|
| 저장 | 기본 IndexedDB. 클라우드는 `kv_store(key text PK, value jsonb)` 1테이블, 상태 전체를 키-값으로 덮어쓰기 | `supabase/migrations/001_kv_store.sql`, `app/api/state/route.ts` |
| 인증 | `STATE_SYNC_SECRET` 공유 비밀 헤더 1개(timing-safe 비교). 사용자·조직 개념 없음 | `app/api/state/route.ts` |
| 멀티테넌트 | **없음** (워크스페이스는 클라이언트 상태 안의 배열) | 구조상 |
| 레이트리밋 | 프로세스 메모리 Map, 인스턴스별. 코드 주석이 "버스트 방어일 뿐 전역 보장 아님"이라고 명시 | `proxy.ts` |
| 비용 통제 | Rank Signal에 시간당 USD 원장(메모리) + 요청당 5달러 상한 + 모델 허용목록 + 가격표 | `rank-signal.ts`, `rank-signal-judge.ts` |
| SSRF | 사설/예약 IPv4·IPv6 블록리스트, IPv6 임베디드 IPv4 재검사, DNS 해석 결과 전부 검사, 파싱 불가 시 거부 | `lib/server/ssrf.ts` + 테스트 |

## 4. 비동기·스케줄

- 서버 큐·워커 **없음**. 장시간 작업은 HTTP 요청 안에서 SSE로 스트리밍(`bulk-sro`, `rank-signal`), `maxDuration` 상한에 묶임.
- 정기 실행은 "브라우저 탭이 열려 있어야 도는 인터벌" + GitHub Actions/cron **템플릿 문서**(실제 실행기 아님).

## 5. 시스템 의존성

모든 수집 경로가 Bright Data 단일 벤더를 통과한다. 분석·판정·재작성은 OpenRouter 단일 경유(허용 모델 목록 환경변수).

## 6. 미구현으로 확인되는 것

서버 사이드 잡 큐, 사용자/조직 모델, 응답 원문의 버전 관리된 분석 파이프라인(점수 재계산 이력), 전역 레이트리밋, 다국어 감성(어휘 목록이 영어), 한국 엔진.
