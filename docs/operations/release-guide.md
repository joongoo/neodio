# 브랜치와 버전 릴리스 운영 지침

| 항목 | 내용 |
| --- | --- |
| 분류 | 운영 가이드 |
| 용도 | 기능 PR, staging 검증, main 릴리스와 버전별 변경 기록을 관리할 때 읽는 기준 |
| 상태 | 정책 확정, 자동화는 이 변경이 main에 반영된 뒤 사용 |
| 확인 기준 | 2026-11-19 사용자 결정, GitHub Actions와 Releases |

## 기본 흐름
test
기능은 `기능 브랜치 → staging` PR로 반영하고 staging에서 검증합니다. 검증한 변경을 모아 `staging → main` 릴리스 PR로 출시합니다. main은 운영 출시 이력, staging은 다음 출시 후보를 관리하는 장기 브랜치입니다. 에이전트는 PR 생성·병합·태그 발행을 별도 행위로 구분하며 사용자 요청 없이 병합하지 않습니다.

새 기능은 최신 staging에서 분기합니다. 하나의 PR은 한 기능이나 독립적으로 검증할 수 있는 수정으로 묶고, 미완성 기능은 staging에 병합하지 않거나 비활성 플래그로 사용자 노출을 막습니다. staging에서 main으로 올리면 staging의 미출시 변경이 모두 포함됩니다. 일부만 출시하려면 별도 릴리스 브랜치 전략을 먼저 합의합니다.

## 병합 방식

| 경로 | 방식 | 이유 |
| --- | --- | --- |
| 단기 기능·수정 브랜치 → staging | 기본 Squash and merge | 작업 중 커밋을 사용자에게 의미 있는 기능 PR 하나로 묶음 |
| 여러 독립 변경과 검증 이력을 보존할 큰 기능 브랜치 → staging | 필요 시 Create a merge commit | 개별 변경 추적·이력 보존. 이 PR에서 사용하는 방식을 본문에 명시 |
| staging → main | 반드시 Create a merge commit | staging 커밋을 main의 조상으로 보존해 릴리스 후 FF 동기화 가능 |
| main → staging 동기화 | 가능하면 fast-forward만 | 같은 출시 커밋을 공유하고 중복 변경 방지 |
| 긴급 hotfix → main | Create a merge commit | 긴급 수정 이력 보존. main 변경을 staging에도 반영해야 함 |

staging→main 또는 main→staging에는 squash/rebase를 사용하지 않습니다. 장기 브랜치를 squash하면 변경 내용이 같아도 커밋 연결이 끊겨 이후 PR에 과거 변경이 다시 나타나거나 충돌·중복 릴리스 기록이 생길 수 있습니다.

기능 PR을 squash한 뒤에는 원본 기능 브랜치를 재사용하지 않고 최신 staging에서 새로 분기합니다. 동일한 기능 브랜치를 staging과 main에 각각 squash 병합하지 않습니다. 큰 PR을 merge commit으로 병합했더라도 PR 제목과 본문은 사용자 관점의 변경 단위를 설명합니다.

## PR 형식과 검증

기능 PR의 base는 staging입니다. 본문은 저장소 기존 양식인 `## 문제`, `## 변경`, `## 검증`, `## 확인 필요`를 사용합니다. 변경에는 사용자가 어떤 메뉴에서 무엇을 할 수 있게 됐는지, 기존 동작과 달라지는 점, 남는 제약을 적습니다. 실제 실행한 테스트와 아직 검증하지 않은 유료 API·브라우저·운영 환경을 구분합니다.

릴리스 PR의 base는 main, head는 staging이며 제목은 정확히 `release: vX.Y.Z`로 씁니다. 본문은 아래 세 항목으로 간결하게 작성합니다.

- `## 포함 변경`: 기능 PR 번호·링크와 한 줄 설명. 별도 운영 지침 수정이 포함되면 해당 커밋도 연결합니다.
- `## 주요 변경`: 사용자가 체감하는 핵심 변경만 짧게 요약합니다.
- `## 배포 확인`: DB·환경변수·수집기 배포 주의사항과 검증 상태, 미검증 항목을 남깁니다.

상세 문제 설명·구현 내역·테스트별 결과는 기능 PR에 기록하고 릴리스 PR에 복사하지 않습니다. 릴리스 담당자는 포함 PR을 따라가 상세를 확인할 수 있어야 합니다. 다만 출시에 필요한 주의사항은 기능 PR 링크만으로 대신하지 않습니다. 이 간결한 사용자용 요약은 GitHub Release에도 사용하며, 자동 생성 변경 목록은 관련 PR·기여자·전체 비교 링크를 보완합니다.

CI 통과, staging에서의 핵심 동작 검증, 출시 버전·환경 설정·DB 변경 확인 후 사람이 병합합니다. PR 생성은 출시 승인이나 자동 병합을 뜻하지 않습니다. 필요한 브랜치 보호는 저장소 설정에서 main/staging 직접 push 금지와 CI 필수 검사로 설정합니다. 자동화 봇의 FF 갱신도 보호 규칙에 막히면 우회하거나 force push하지 않습니다.

## 버전 번호와 GitHub 변경 기록

버전은 `vMAJOR.MINOR.PATCH` 태그와 GitHub Releases를 기준으로 관리합니다. 호환성에 영향을 주는 변경은 MAJOR, 호환 가능한 기능 추가는 MINOR, 호환 가능한 수정은 PATCH로 선택합니다. `v0.x.y` 운영 중에도 파괴적 변경 여부는 릴리스 본문에 명시합니다. 버전 선택은 릴리스 담당자가 PR 제목으로 결정하고 자동으로 추정하지 않습니다.

아직 릴리스 태그가 없으면 첫 버전 역시 담당자가 선택합니다. `package.json`의 현재 버전으로 첫 태그를 자동 발행하지 않습니다. 앱 출시 태그와 설치형 수집기 배포 버전은 별개이며 수집기 버전은 기존 빌드·다운로드 정책을 유지합니다. 이미 발행한 태그를 이동·삭제하거나 같은 버전으로 다른 코드를 출시하지 않습니다.

`.github/workflows/release.yml`은 다음을 수행합니다.

1. main 대상 릴리스 PR의 출처·제목·기존 태그보다 높은 버전인지 검사합니다. 일반 기능 PR의 main 직접 반영은 거절하고, 명시적 `hotfix/` PR만 예외로 허용합니다.
2. staging 또는 hotfix PR이 main에 merge commit으로 병합되면 정확한 병합 SHA에 버전 태그를 붙입니다. squash/rebase 병합이면 태그를 만들지 않고 실패로 알립니다.
3. 릴리스 PR 본문과 GitHub 자동 생성 변경 목록을 합쳐 GitHub Release를 발행합니다. `.github/release.yml`의 라벨별 분류를 사용합니다. 사람의 출시 승인과 GitHub Release 발행은 이어지지만 Vercel 배포 성공을 보증하는 것은 아닙니다.
4. 최신 staging이 출시 SHA의 조상일 때만 staging을 그 SHA로 FF 갱신합니다. staging이 이미 출시 SHA를 포함하면 유지합니다. 두 이력이 갈라졌거나 브랜치 보호로 갱신할 수 없으면 자동화가 실패로 알리고 강제로 덮어쓰지 않습니다.

Release 생성과 FF는 같은 workflow에서 직접 수행합니다. `GITHUB_TOKEN`으로 만든 태그/push가 다른 Actions workflow를 다시 실행할 것이라고 가정하지 않습니다. GitHub 외부 배포 서비스의 봇 push 처리 여부는 별도 운영 설정으로 확인합니다. 자동 생성 변경 목록은 PR 제목·라벨과 릴리스 간 비교를 제공하고, 본문은 사용자에게 중요한 변경과 제약을 설명합니다.

자동화에는 저장소의 Actions 실행 허용과 `contents: write` 권한이 필요합니다. 이번 정책은 저장소 설정이나 보호 규칙을 자동 변경하지 않습니다. 첫 workflow가 main에 들어오기 전 이벤트는 자동화되지 않을 수 있으므로 첫 릴리스 실행 여부를 확인합니다.

## 릴리스 후 동기화와 긴급 수정

릴리스 중 staging에 새 기능이 들어오면 main과 staging의 이력이 갈라져 FF가 불가능할 수 있습니다. 출시 시 staging 병합을 잠시 멈추면 이를 줄일 수 있습니다. 갈라진 경우 `main → staging` 동기화 PR을 만들고 merge commit으로 반영합니다. 이 동기화 PR도 staging 대상이지만 예외적으로 squash하지 않습니다. 새로운 staging 변경을 버리거나 force push하지 않습니다.

긴급 수정은 main에서 `hotfix/<주제>`로 분기하고 main 대상 `release: vX.Y.Z` PR로 검증·승인 후 merge commit으로 반영합니다. 같은 자동화로 버전과 Release를 기록합니다. staging이 FF될 수 없으면 main→staging 동기화 PR로 긴급 수정을 전달합니다. 진행 중인 릴리스 PR은 hotfix 이후 버전으로 갱신합니다.

취소·롤백은 릴리스 태그를 옮기는 것이 아니라 revert PR과 새 PATCH 릴리스로 처리합니다. 긴급 배포 롤백이 먼저 필요하더라도 소스 수정·DB 호환성·후속 릴리스 기록을 별도로 남깁니다.

## 자동화 실패 복구

Release 생성 후 FF만 실패했다면 같은 workflow를 재실행할 수 있습니다. 동일 버전 태그가 같은 SHA를 가리키면 재사용하고 이미 있는 Release는 중복 생성하지 않습니다. 다른 SHA를 가리키면 중단합니다. 충돌한 버전을 덮어쓰지 않습니다.

잘못된 제목이나 squash 병합으로 이미 main에 들어간 경우 재실행만으로 이력은 복구되지 않습니다. 담당자가 원인·실제 출시 SHA·버전·동기화 방식을 확인한 뒤 복구를 결정해야 합니다. 에이전트가 임의로 태그를 생성하거나 main/staging 이력을 재작성하지 않습니다.

## 관련 자료

- [작업 시작 문서](../README.md)
- [GitHub 병합 방식](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github)
- [GitHub 자동 릴리스 노트](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
- [GITHUB_TOKEN의 이벤트 실행 범위](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
