# 로컬 수집 worker

Vercel 프로젝트 연결 없이 웹과 별도 worker 프로세스를 실행한다. DB 선점, 동시 처리 제한, 제출·회수·정규화·저장과 stale 격리는 운영과 동일한 코드를 사용한다.

`.env.local`에 다음 값을 설정한다. 웹 서버와 worker는 같은 환경변수와 DB를 사용해야 한다.

```dotenv
DATAFORSEO_EXECUTOR=local
DATAFORSEO_MOCK=true
DATAFORSEO_LOCAL_INTERVAL_MS=5000
```

```powershell
npm run dev
# 별도 터미널
npm run worker:dataforseo
```

worker는 5초마다 처리할 작업을 확인한다. 한 번만 실행하려면 `npm run worker:dataforseo -- --once`를 사용한다. 종료는 Ctrl+C이며, 진행 중인 한 회차를 마친 뒤 종료한다. 재시작하면 DB에 남은 작업을 이어받는다. 불명확한 제출은 자동 재제출하지 않는다.

`DATAFORSEO_MOCK=true`는 API 자격 증명 없이 동작하며 외부 Provider 요청을 하지 않는다. 세 엔진 모두 `[MOCK 테스트 데이터]` 답변과 example.com 출처를 저장하고 실제 비용은 0으로 기록한다. 화면의 예상 비용은 기존 단가 계산을 유지한다. 목 데이터도 실제 제품 테이블에 저장되므로 별도 개발 DB와 테스트 브랜드를 사용한다. mock task ID에는 `mock-` 접두어가 붙으며 모드가 다른 task의 결과 회수는 거부한다. 모드 변경 전에 진행 중인 작업을 마치고 웹과 worker를 함께 재시작한다.

실제 호출은 `DATAFORSEO_MOCK=false`, `DATAFORSEO_ENABLED=true`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`가 필요하다. 이때 worker가 DB의 승인된 대기 작업을 제출하면 비용이 발생한다. worker는 시작할 때 MOCK/LIVE를 출력한다. mock은 Vercel 및 production 환경에서 사용할 수 없다.

운영에서는 `DATAFORSEO_EXECUTOR=vercel`, `DATAFORSEO_MOCK=false`, `DATAFORSEO_QUEUE_ENABLED=true`로 설정한다. 로컬 환경변수만으로 Vercel의 인증·메시지 전달·지연 재전달은 검증할 수 없으므로 Preview 배포에서 별도로 확인한다.

## 작업 흐름과 다음 단계

사용자가 로컬 mock 수집의 정상 동작을 확인했다. 최신 잔여 작업과 수집 로그의 요청 목록·상세 개편 지침은 [REMAINING-WORK.md](REMAINING-WORK.md)를 따른다. 아래 기록보다 해당 문서의 최신 순서를 우선한다.

2026-11-17: Vercel Queue 연결 후, 오래된 `submitting`을 `submission_unknown`으로 격리하는 stale-task sweeper까지 구현했다. 실제 등록 검증 중 누락 스키마, React 효과 취소, 로컬 OIDC 요구사항이 발견되어 로컬 실행 모드를 추가했다.

이번 단계 후에는 먼저 로컬 mock으로 등록 → worker 처리 → 수집 로그 반영과 재시작 복구를 확인한다. 이후 `QUEUE-AND-COLLECTION-UX.md`의 구현 순서 10번인 요청 상세·비용 재확인·사용자 명시적 재제출 UI의 현 구현 상태를 점검하고 남은 부분을 구현한다. 이어서 11번 조직별 예산 제한·stale 경보·운영 상태 표시로 진행한다. 기존 작업 완료 여부는 코드와 대조해 확정한다. 자동 재제출 금지, 사이드바 자동 폴링 금지, 최종 수집일 보류 결정을 유지한다.
