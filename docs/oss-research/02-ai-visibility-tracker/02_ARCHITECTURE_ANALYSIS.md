# 02. ARCHITECTURE_ANALYSIS — ai-visibility-tracker @ fad7d13

## 1. 구조

```
pnpm 모노레포
├─ apps/web   Next.js(App Router) UI + oRPC API + GEO 서비스 + BullMQ 워커(같은 이미지, 별도 컨테이너)
│   ├─ services/geo/     orchestrator(수집) · parser · scorer(LLM 채점) · sov(스냅샷) · intent · locations · dataforseo · citation-gap · site-analyzer
│   ├─ workers/          queue.ts(BullMQ 큐 1개), geo-sweep-worker.ts
│   ├─ jobs/repeatable/  scheduler.ts(주 1회 반복 잡)
│   └─ utils/            safe-fetch(SSRF), job-store
└─ packages/db  Drizzle 스키마 + 생성된 SQL 마이그레이션 3개
Docker Compose: postgres + redis + web + worker
```

## 2. 데이터 흐름 (스윕 1회)

1. **수집(checks)**: 프롬프트 × 모델(엔진) 조합을 실행 → `geo_llm_run` 1행 + 인용 N행 저장. 같은 (프롬프트, 모델, 날짜)는 **유일 키**라 하루 1건. 수동 재확인만 `force`로 덮어씀.
2. **채점(scoring)**: 점수 미산정 실행을 모아 별도 LLM 호출로 구조화 채점(JSON) → 정확도/커버리지/감성/추천 여부/순위/속성/경쟁사 목록 저장.
3. **SoV 스냅샷**: 해당 날짜의 **채점된 실행**만 분모로 자사·경쟁사 별 언급률/인용률/추천률을 계산해 날짜별 행으로 upsert.
4. 각 단계의 진행률은 job-store에 기록되어 UI가 표시.

## 3. 스케줄·큐

| 항목 | 현황 |
|---|---|
| 정기 실행 | BullMQ **반복 잡**(7일 간격, 고정 jobId로 부팅마다 upsert → 중복 등록 방지) |
| 팬아웃 | 반복 잡이 켜진 프로젝트(활성 프롬프트 있는 곳)마다 스윕 잡 1개씩 큐에 추가 |
| 재시도 | 잡 attempts 2 + 지수 백오프(5초) |
| 동시성 | 워커 concurrency **1**, 락 30분, 정체(stalled) 감지 60초 |
| 비고 | 큐는 1개뿐(코드 주석에 "Climby에서 포팅" 흔적: 호환용 별칭 존재) |

## 4. 격리·인증·비밀

- 모든 테이블이 `project_id`(cascade 삭제)를 갖는 **프로젝트 단위 격리**. 조직(org)/멤버십 계층은 이 코어에서 확인되지 않음(Better Auth로 계정은 있음 — 세부 권한 모델은 **미검증**).
- API 키: 프로젝트별 입력 가능, **AES-256-GCM**으로 저장 시 암호화, 마지막 4자리만 표시. 키는 환경변수 하나(32바이트 hex)로 관리.
- 공유 링크 토큰은 해시만 저장.
- SSRF: 사용자 입력 URL용 `safeFetch`(리다이렉트 5회 제한, 사설 대역·도커 내부 호스트명 차단). 코드 주석이 **DNS 재해석(TOCTOU)은 미해결**임을 명시.

## 5. 비용·한도

- 엔진별 호출당 실측 단가표(상수)와 사전 비용 추정 함수, DataForSEO **킬스위치**(환경 설정), 실행·채점 각각 토큰·비용 컬럼 저장.
- 조직/프로젝트별 예산 한도나 원장은 확인되지 않음.

## 6. 외부 의존성 / 종속성

OpenRouter 단일 LLM 경로(+모델 폴백 1개), DataForSEO(선택), Redis(필수 — 큐), 단일 워커 컨테이너.

## 7. 미구현·미확인

테스트(거의 없음), 조직 계층·역할 세분화, 다국어 감성/매칭, 한국 엔진, 응답 원문 증거의 재현 가능한 버전 관리(분석 버전 컬럼 없음 — 채점 모델명만 저장), 하루 내 반복 샘플링.
