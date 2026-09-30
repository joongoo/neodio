#!/bin/sh
# 빌드한 수집기 설치 파일(dist/collector/*.zip)을 비공개 Blob 저장소에 올린다.
# 토큰은 키체인의 neodio-blob-rw(scripts/secret.sh set neodio-blob-rw)에서 읽는다.
set -e
cd "$(dirname "$0")/.."
# "export const COLLECTOR_VERSION"만 — MIN_COLLECTOR_VERSION 같은 다른 줄까지 걸리면 버전이 두 줄이 된다.
version="$(sed -n 's/^export const COLLECTOR_VERSION = "\([0-9.]*\)".*/\1/p' src/lib/collectorAgent.ts)"
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "COLLECTOR_VERSION을 읽지 못했습니다: '$version'" >&2; exit 1 ;;
esac
ls dist/collector/neodio-collector-*-"$version".zip > /dev/null 2>&1 || { echo "dist/collector에 $version 버전 zip이 없습니다. 먼저 빌드하세요: node collector/build.mjs --origin <운영 주소>" >&2; exit 1; }
BLOB_READ_WRITE_TOKEN="$(scripts/secret.sh get neodio-blob-rw)"
export BLOB_READ_WRITE_TOKEN
cd dist/collector
for f in neodio-collector-*-"$version".zip; do
  npx -y vercel@latest blob put "$f" --pathname "collector/$f" --access private --allow-overwrite true < /dev/null
done
