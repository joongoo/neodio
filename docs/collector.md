# 네오디오 수집기 (설치형, 선택 수집)

운영(Vercel)에는 실제 Chrome이 없어서 네이버 AI검색·구글 AI 모드 수집을 서버에서 돌릴 수 없다.
그래서 수집은 사용자 PC에 설치한 **수집기**가 하고, 웹 화면(브라우저)이 다리 역할을 한다.

```
프롬프트 라이브러리 "선택 수집"
  → 수집기 확인(127.0.0.1:17380 — 설치·버전·Chrome)
  → 없으면 운영체제별 설치 파일 안내 → 설치 후 "다시 확인"
  → 선택한 프롬프트로 수집 명령 → 수집기가 Chrome으로 수집, 결과는 그 PC에 저장
  → 끝나면 결과 확인 → "반영" → 브라우저가 결과를 받아 /api/collection-runs/import로 저장
```

- 수집기는 서버·DB에 직접 붙지 않고 비밀 정보도 갖지 않는다. 반영은 로그인한 브라우저가 한다.
- 창을 닫아도 수집은 PC에서 계속되고, 다시 열면 "반영하지 않은 수집"으로 이어서 볼 수 있다.
- 로컬 대시보드(`npm run dev`)는 지금처럼 서버가 바로 수집한다. `NEODIO_COLLECTION_MODE=agent`를 주면
  로컬에서도 운영과 같은 수집기 흐름을 쓴다.

## 사이트맵 크롤 (0.2.0부터)

콘텐츠 가시성·FAQ·목차·복잡도 같은 "기회" 지표는 페이지를 브라우저로 렌더링해야 잴 수 있어서, 운영에서는 이것도 수집기가 한다.
`kind: "sitemap-crawl"` 작업을 받아 설치된 Chrome으로 [scripts/crawl-sitemap.mjs](../scripts/crawl-sitemap.mjs)를 돌리고
(`--browser-channel chrome`), 끝난 결과를 화면이 받아 `POST /api/sitemap-crawl/import`로 올린다. 서버에는 `sitemap_crawls`
테이블에 조직·도메인·크롤 시각별로 저장하고(같은 크롤을 다시 올려도 덮어쓴다), 기회 화면들은 이 DB를 읽는다.

- 화면 쪽 창구는 [sitemapCrawlClient.ts](../src/lib/sitemapCrawlClient.ts) — 로컬 개발은 서버가 직접 크롤하고(`/api/sitemap-crawl/start`),
  서버가 `code: "agent"`로 알려 주는 환경(운영, 또는 `NEODIO_COLLECTION_MODE=agent`)은 수집기로 넘어간다. 화면 코드는 두 경우를 같게 다룬다.
- 수집기가 없거나 0.2.0보다 오래됐거나 Chrome이 없으면 설치 안내 창([CollectorSetupHost](../src/components/collector/CollectorSetupHost.tsx))이 뜬다.
- 크롤 대상은 화면이 알려준 브랜드 도메인(과 하위 도메인)만 받는다([collectorCrawlSpec.ts](../src/lib/collectorCrawlSpec.ts)).
  서버는 올라온 결과의 모양·범위를 다시 검증해 저장한다([sitemapCrawlImport.ts](../src/lib/sitemapCrawlImport.ts)).
- 로컬 크롤이 남기는 `.tmp/sitemap-crawl/*.json` 파일도 계속 읽는다(같은 크롤 시각이면 DB가 우선). 운영은 DB만 있다.
- **0.1.x 수집기는 이 작업을 모른다.** 새 zip(`COLLECTOR_VERSION` 0.2.0)을 빌드해 Blob에 올리고, 수집 PC에서 설치 파일을 다시 실행해야 한다.

시험용 환경변수: `NEODIO_COLLECTOR_PORT`, `NEODIO_COLLECTOR_HOME`으로 설치된 수집기와 겹치지 않는 개발용 수집기를 따로 띄울 수 있다
(`npx tsx collector/agent.ts run`).

## YouTube AIO "지금 수집" (0.3.0부터)

Google AI Overview는 실제 Chrome으로 검색해야 해서 운영에서는 이것도 수집기가 한다. 무엇을 수집할지는 서버가 정하고, 수집기는 검색만 한다.

```
"지금 수집" → 서버가 계획을 짠다(키워드 × 디바이스, 오늘 수집한 건 제외, 섞은 순서) — POST /api/youtube-aio/collect 가 { agent: 계획 }을 돌려준다
  → 브라우저가 수집기에 "aio-collect" 작업을 시킨다(검색 사이 1~2분 쉼, 캡차가 뜨면 그 자리에서 멈춤)
  → 검색이 하나 끝날 때마다 브라우저가 그 원본 결과를 POST /api/youtube-aio/import 로 올린다
  → 서버가 자사 영상 판정(채널 매칭)과 저장을 한다
```

- 화면 쪽 창구는 [aioCollectClient.ts](../src/lib/aioCollectClient.ts) — 로컬 개발은 서버가 직접 수집하고, 서버가 `agent` 계획을 돌려주는 환경(운영,
  또는 `NEODIO_COLLECTION_MODE=agent`)은 수집기로 넘어간다. 화면(`AioCollectButton`)은 두 경우를 같게 다룬다.
- 판정·저장을 서버가 하는 이유: 채널 매칭에 YouTube 조회가 필요하고, 판정 기준을 화면(수집기)이 정하게 두지 않기 위해서다. 수집기는 서버·DB에 붙지 않는다.
- 서버는 올라온 결과의 모양·범위를 다시 검증한다([aioResultImport.ts](../src/lib/aioResultImport.ts)). 최근 48시간 안에 수집한 값만 받고(같은 날 결과를 덮어쓰므로),
  화면 캡처·HTML 경로(그 PC의 파일)는 받지 않는다.
- 수집기는 검색 사이 간격에 하한(30초)을 강제한다([collectorAioSpec.ts](../src/lib/collectorAioSpec.ts)) — 화면이 간격을 줄여 캡차를 부르지 못하게.
- 브라우저를 닫아도 수집은 PC에서 계속되고, 다시 열면 이어서 보여 주며 아직 올리지 않은 결과를 올린다.
- 수집기가 없거나 0.3.0보다 오래됐거나 Chrome이 없으면 설치 안내 창이 뜬다. **0.2.x 수집기는 이 작업을 모른다** — 새 zip을 설치해야 한다.

## 구성

| 위치 | 역할 |
|---|---|
| [collector/agent.ts](../collector/agent.ts) | 수집기 — `run`(127.0.0.1 서버; AI 수집·사이트맵 크롤·AIO 수집 작업), `install`(설치 + 로그인 시 자동 시작), `uninstall`, `status` |
| [collector/build.mjs](../collector/build.mjs) | 운영체제별 설치 파일(zip) 만들기 |
| [src/lib/collectorAgent.ts](../src/lib/collectorAgent.ts) | 웹 ↔ 수집기 약속(포트, 버전, 작업 형식) |
| [src/lib/collectorClient.ts](../src/lib/collectorClient.ts) | 브라우저에서 수집기 호출 |
| [AgentCollectionModal](../src/components/prompt-library/AgentCollectionModal.tsx) | 선택 수집 화면(확인 → 설치 안내 → 진행 → 반영) |
| `/api/collection-runs/import` | 반영 — 지금 조직으로 저장, 같은 실행은 덮어쓰기 |
| `/api/youtube-aio/import` | AIO 수집 반영 — 검색 한 건의 원본을 받아 서버가 판정·저장 |
| `/api/sitemap-crawl/import` | 사이트맵 크롤 반영 — 지금 조직의 `sitemap_crawls`에 저장, 같은 크롤은 덮어쓰기 |
| `/api/collector-download?platform=` | 비공개 Blob의 설치 파일로 가는 임시 링크(10분) — 로그인한 화면에서만 |

수집기는 저장소의 수집 스크립트(`scripts/collect-naver-ai.mjs`, `collect-google-ai.mjs`)를 그대로 번들해 실행한다.
네이버도 `--browser-channel chrome`으로 설치된 Chrome을 쓰므로 설치 파일에 Playwright 브라우저를 넣지 않는다.

## 보안

- 127.0.0.1에서만 연다. `Host`가 127.0.0.1/localhost가 아니면 거절한다(DNS rebinding 방지).
- 브라우저 요청은 허용된 화면 주소(`Origin`)에서만 받는다 — 빌드할 때 `--origin`으로 넣은 운영 주소 + 로컬 개발
  주소(localhost:3000). 설치 때 `install --origin <주소>`로 더할 수 있다(`config.json`).
- 수집 명령은 `Content-Type: application/json`만 받아, 다른 사이트의 폼 전송으로 수집을 시킬 수 없다.
- `/shutdown`은 `Origin`이 없는 요청(같은 PC의 설치 명령)만 받는다.
- Chrome의 사설망 접근 제한에 맞춰 사전 요청에 `Access-Control-Allow-Private-Network: true`를 준다.
  Chrome이 "로컬 네트워크 접근" 권한을 물으면 허용해야 한다. Safari는 https 화면에서 http://127.0.0.1을
  막아 쓸 수 없다(화면에 안내).

## 설치 파일 만들고 올리기

```bash
node collector/build.mjs --origin https://<운영 주소>            # mac-arm64, mac-x64, win-x64 전부
node collector/build.mjs --origin https://<운영 주소> --platform win-x64
node collector/build.mjs --local-node                             # 이 PC용만, 지금 node로(시험용)
```

- 결과: `dist/collector/neodio-collector-<platform>-<version>.zip`(각 약 40MB). Node 런타임(v22)은
  nodejs.org에서 받아 `.tmp/collector-build/`에 보관한다.
- 설치 파일은 **비공개** Vercel Blob 저장소 `neodio-blob`(icn1)의 `collector/`에 이름 그대로 둔다.
  공개 주소가 없고, 받기는 운영 화면(사이트 로그인 뒤)에서 서버가 만든 10분짜리 임시 링크로만 된다
  (`@vercel/blob`의 `issueSignedToken` + `presignUrl`).
- 저장소는 Vercel 대시보드에서 neodio 프로젝트(Production, Preview)에 연결돼 있다. 연결하면 `BLOB_STORE_ID`가
  프로젝트 환경변수로 생기고 SDK가 Vercel OIDC로 인증한다. 둘 다(또는 `BLOB_READ_WRITE_TOKEN`) 없으면 받기 버튼이
  비활성으로 보인다.
  CLI로 연결·링크하면 로컬 `.env.local`을 Vercel 값으로 덮어쓰므로 쓰지 않는다.
- 올리기 — 저장소 읽기·쓰기 토큰(대시보드에서 복사)은 키체인에 한 번만 넣어 둔다. 값을 복사한 채로:

  ```bash
  scripts/secret.sh set neodio-blob-rw      # 클립보드 → 키체인(저장 뒤 클립보드를 비운다)
  npm run collector:upload                  # dist/collector의 현재 버전 zip을 collector/ 아래로 올린다
  ```

  토큰 형식 확인은 `scripts/secret.sh check neodio-blob-rw`(`vercel_blob_rw_`로 시작해야 한다).

## 설치 (수집 PC)

Google Chrome이 있어야 한다.

- **macOS**: zip 풀기 → `install.command` 더블클릭 → "열지 않음" 창에서 완료 → 시스템 설정 → 개인정보 보호 및 보안 → 맨 아래로 스크롤 → "그래도 열기" → 확인 창에서 다시 "그래도 열기" + 암호. `~/.neodio-collector/runtime`에
  복사되고 `~/Library/LaunchAgents/com.neodio.collector.plist`로 로그인 시 자동 실행된다.
- **Windows**: zip을 우클릭 → "모두 압축 풀기"로 풀고(zip 안에서 실행하면 안 된다) 폴더의 `install.cmd` 더블클릭. 파란 "Windows의 PC 보호" 창이 뜨면 추가 정보 → 실행. `%LOCALAPPDATA%\NeodioCollector\runtime`에 복사되고
  시작프로그램 폴더의 `neodio-collector.vbs`로 로그인 시 창 없이 실행된다(관리자 권한 불필요).
- 제거: `uninstall.command` / `uninstall.cmd`. 수집 결과·설정·로그(`logs/agent.log`)는 남는다.

설치 안내 화면([CollectorInstallGuide](../src/components/collector/CollectorInstallGuide.tsx))은 macOS / Windows 탭으로 나뉜다. 감지된 OS가 먼저 열리고, 다른 PC에 설치할 때를 위해 탭을 바꿀 수 있다. Windows 단계는 텍스트뿐이며 실제 Windows 화면으로 확인·캡처하지는 않았다.

설치 파일은 코드 서명·공증을 하지 않았다. macOS는 시스템 설정의 "그래도 열기"(Sequoia 이후 우클릭 → 열기로는 우회되지 않는다), Windows는 "추가 정보 → 실행"이 한 번 필요하다.

## 업데이트

수집 스크립트나 수집기 동작이 바뀌면 [collectorAgent.ts](../src/lib/collectorAgent.ts)의 `COLLECTOR_VERSION`을
올리고 다시 빌드해 올린다. 기존 PC가 반드시 새 버전을 써야 하면 `MIN_COLLECTOR_VERSION`도 올린다 — 낮은 버전은
선택 수집 화면에서 업데이트 안내를 받는다. 새 zip의 설치 파일을 다시 실행하면 덮어쓰고 재시작한다.

## 개발

```bash
npm run collector -- run                          # 저장소의 스크립트로 수집기 실행(127.0.0.1:17380)
NEODIO_COLLECTION_MODE=agent npm run dev          # 선택 수집이 수집기 흐름을 쓴다
```

수집기 데이터: macOS `~/.neodio-collector`, Windows `%LOCALAPPDATA%\NeodioCollector`
(`jobs/` 작업 기록, `results/<작업>/` 수집 결과 JSON·캡처, `work/` Chrome 임시 프로필, `logs/`).
반영한 작업은 최근 30개까지만 남기고 수집기 시작 때 지운다.
