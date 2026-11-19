<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 브랜치와 릴리스

브랜치·PR·병합·버전·출시 작업 전 [릴리스 운영 지침](docs/operations/release-guide.md)을 읽고 따른다. 기본은 기능 브랜치→staging PR, 검증 후 staging→main 릴리스 PR이다. 단기 기능 PR은 squash 가능하지만 장기 브랜치 간 병합은 merge commit 또는 fast-forward만 사용한다. PR 본문은 사용자 관점으로 문제·변경·검증·확인 필요를 설명한다. 요청 없이 PR 병합, 버전 발행, force push를 하지 않는다.

## Code Review Rules

### 영향 범위와 회귀

- PR의 목적과 유지해야 할 기존 사용자 동작을 먼저 파악한다. 변경된 코드의 직접 호출자와 결과 소비자를 따라 입력→처리→저장→표시 경로를 확인한다. 관련 경로부터 읽고 공통 코드·계약 변경의 근거가 있을 때 범위를 넓힌다.
- 수집 공통 코드를 변경하면 로컬·설치형 수집기·SERP API 중 실제 공유하는 경로와 PC·모바일 차이를 확인한다. 본문·문단·인용 연결, 빈 응답·실패·재시도 시의 상태와 중복 저장이 기존 동작을 깨뜨리는지 검토한다. 공유하지 않는 경로까지 영향이 있다고 추정하지 않는다.
- API·저장 형식·권한을 변경하면 기존 데이터와 이전 수집기/클라이언트의 호환성, 조직·브랜드 간 데이터 격리를 확인한다. 호환성을 유지하거나 명시적인 이관·버전 정책이 있어야 한다. 서버 배포와 수집기 배포의 적용 시점 및 과거 데이터 보정 필요성도 구분한다.

### 검증과 보고

- 보안 관련 변경은 [SECURITY.md](SECURITY.md)의 신뢰 경계와 보안 회귀 기준을 함께 적용한다. 이 문서는 리뷰 기준이며 별도 보안 스캔을 자동 활성화하지 않는다.
- 버그 수정 테스트는 실제 발생 조건을 재현하고 기존 코드에서 실패하는지 확인한다. 영향받는 인접 동작도 보호하는지 검토한다. 테스트를 실행하지 못했다면 통과했다고 쓰지 않는다.
- 실제 영향 경로와 발생 조건을 설명할 수 있는 문제를 우선한다. 지적에는 심각도·코드 위치·사용자 영향·근거를 포함하고, 불확실한 위험은 검증 공백으로 구분한다. 스타일 지적과 diff 재서술은 생략한다.
- 리뷰 요약이 가능한 경우 전체 판단, 회귀 영향 범위, 검증 공백을 짧게 남긴다. 문제를 찾지 못했더라도 미검증 경로를 안전하다고 단정하지 않는다. 재리뷰는 새 변경과 이전 지적의 해결 여부부터 확인하되 공통 로직·DB·권한·API 계약이 바뀌면 영향 범위를 다시 추적한다.
