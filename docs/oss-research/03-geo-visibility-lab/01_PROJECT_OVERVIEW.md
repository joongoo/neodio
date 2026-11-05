# 01. PROJECT_OVERVIEW — briton2008/geo-visibility-lab

> 분석 문서(원본 참조 포함). 독립 설계(05)로 원본 표현을 옮기지 않는다. 동일 세션 분석이라 엄격한 Clean-Room이 아니다(06 §4).

## 기본 정보

| 항목 | 내용 |
|---|---|
| URL | https://github.com/briton2008/geo-visibility-lab |
| 분석 Commit | `c77c5efff6328a02a18b3a842bb1428d1a22a7fa` (2026-09-24, "Rename project to GEO Visibility Lab") |
| 분석 방식 | `git clone --depth 1`, 읽기 전용. **설치·실행·테스트 없음**(얕은 복제라 이력 미확인) |
| 라이선스 | **Apache-2.0** (`LICENSE`). 로고·회사명은 별도 상표 고지(`TRADEMARKS.md`) |
| 서드파티 | Tabler Icons(MIT) 일부 아이콘 경로 (`THIRD_PARTY_NOTICES.md`). 그 외 Python 서드파티 의존성 **없음**(README 주장, `pyproject.toml` 미정독) |
| 규모 | 추적 파일 50개, Python 약 1.4k줄(`domestic_geo.py` 822줄 + 러너·서버 등) + 프런트 JS 687줄, 테스트 32개(425줄) |
| 스택 | Python 3.9+ 표준 라이브러리, 정적 HTML/JS 대시보드, JSON 파일 저장 |
| 운영 주체 | 중국 광시성 소재 기업(桂林恒利原生物科技)이 자사 사이트 GEO 운영 중 개발해 공개한 도구 |
| 별칭/배포 | Claude Code·Codex·Gemini CLI **플러그인/스킬**로도 배포 (`.claude-plugin`, `.codex-plugin`, `skills/`) |

## 목적과 핵심 기능

"증거 추적이 가능한 자체 호스팅 GEO 모니터." 고정 질문 세트를 여러 OpenAI-호환 모델에 보내 **브랜드 언급 / 명시적 순위 / 이름 언어(중·영) / 인용 출처 / 실패 상태 / 이력**을 **분리해서** 기록한다.

중요한 설계 철학: 이 도구는 ChatGPT 등 소비자 앱을 수집하지 않는다. **검색 API(텍스트 증거) → 모델 API(증거만으로 답변)**의 2층 구조로 "투명한 복제(transparent replica)" 환경을 만들고, 그 결과를 채점한다. README가 "모델 API 회귀는 소비자 앱 화면과 같지 않다", "내부 지식/학습 포함을 증명하지 않는다"고 명시한다.

- 버전 관리되는 질문 세트 + 비교용 지문(해시)
- 모델·검색 설정 스냅샷 저장, 토큰 사용량 기록, 키는 저장하지 않음
- 일/주/수동 모니터링 계획(기본은 드라이런, `--execute`일 때만 호출), 설치형 스케줄러 없음
- 월 비용 예측(호출 수 × 단가), 절약형 모델 설정 가이드

## 외부 서비스

Tencent Cloud WSA(웹 검색 API), 중국 모델 API 일반(DeepSeek, Qwen/Bailian, Volcengine Doubao, Kimi, ERNIE 등), Gemini/OpenAI 호환 엔드포인트.

## 운영 상태

활발(분석 시점 직전 개명 커밋). 릴리스 태그는 README 배지로만 확인, **미검증**. README에 6모델 월 비용 추정(2026-09-21 기준 표기)이 있으나 실제 단가 **미검증**.

## 상용 SaaS 적용 시 위험 요소

1. 멀티테넌트·DB·권한 없음(로컬 파일). 구조는 이식 불가, 개념만 참고 가능.
2. 중국 시장·중국 공급자 특화 → 한국 시장에 직접 가치 낮음.
3. "복제 환경" 측정이라 실제 소비자 AI의 노출과 다름 → Neodio의 실측(네이버/구글 화면, 공식 API)과 목적이 다름.
4. 표본 통계 처리 없음(하루 1회, 문항당 1표본).
