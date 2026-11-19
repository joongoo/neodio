<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 브랜치와 릴리스

브랜치·PR·병합·버전·출시 작업 전 [릴리스 운영 지침](docs/operations/release-guide.md)을 읽고 따른다. 기본은 기능 브랜치→staging PR, 검증 후 staging→main 릴리스 PR이다. 단기 기능 PR은 squash 가능하지만 장기 브랜치 간 병합은 merge commit 또는 fast-forward만 사용한다. PR 본문은 사용자 관점으로 문제·변경·검증·확인 필요를 설명한다. 요청 없이 PR 병합, 버전 발행, force push를 하지 않는다.
