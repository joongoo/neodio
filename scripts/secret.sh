#!/bin/sh
# 토큰·비밀번호를 macOS 키체인에 넣고 꺼내는 도우미 — 채팅·셸 기록·파일에 값이 남지 않는다.
#
#   scripts/secret.sh set <이름>   # 클립보드 내용을 저장(먼저 값을 복사해 둘 것). 저장 뒤 클립보드를 비운다
#   scripts/secret.sh get <이름>   # 값 출력(다른 스크립트에서 $(...)로 쓴다)
#   scripts/secret.sh check <이름> # 값을 숨기고 앞 15자만 보여 준다(형식 확인용)
#   scripts/secret.sh delete <이름>
#
# 이름 예: neodio-blob-rw (수집기 설치 파일을 올리는 Vercel Blob 읽기·쓰기 토큰)
set -e
cmd="$1"; name="$2"
[ -n "$cmd" ] && [ -n "$name" ] || { sed -n 2,9p "$0" | sed 's/^# \{0,1\}//'; exit 1; }
case "$cmd" in
  set)
    value="$(pbpaste)"
    [ -n "$value" ] || { echo "클립보드가 비어 있습니다. 값을 먼저 복사하세요." >&2; exit 1; }
    security add-generic-password -U -a "$USER" -s "$name" -w "$value"
    printf '' | pbcopy
    echo "저장했습니다: $name (앞 15자: $(printf %s "$value" | cut -c1-15)…, ${#value}자). 클립보드는 비웠습니다."
    ;;
  get) security find-generic-password -a "$USER" -s "$name" -w ;;
  check) security find-generic-password -a "$USER" -s "$name" -w | cut -c1-15 ;;
  delete) security delete-generic-password -a "$USER" -s "$name" ;;
  *) echo "알 수 없는 명령: $cmd (set | get | check | delete)" >&2; exit 1 ;;
esac
