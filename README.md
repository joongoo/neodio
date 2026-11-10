# Neodio

Next.js 기반 브랜드 가시성 관리 애플리케이션입니다.

## 시작하기

```bash
npm install
npm run dev
```

로컬 주소: http://localhost:3000

## 프로젝트 구조

| 경로 | 내용 |
| --- | --- |
| `src/app` | 페이지와 API 라우트 |
| `src/components` | 화면 컴포넌트 |
| `src/lib` | 데이터, 인증, 수집 및 처리 로직 |
| `collector` | 수집기 코드 |
| `scripts` | 운영 및 개발 스크립트 |
| `docs` | 설계, 운영, 조사 문서 |

## 문서

[문서 안내](docs/README.md)에서 용도와 기능별로 찾을 수 있습니다.

실행 명령과 의존성은 [`package.json`](package.json)을 참조하세요. 환경 변수는 로컬 `.env.local`에서 관리합니다.
