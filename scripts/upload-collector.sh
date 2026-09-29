#!/bin/sh
# 빌드한 수집기 설치 파일(dist/collector/*.zip)을 비공개 Blob 저장소에 올린다.
# 토큰은 키체인의 neodio-blob-rw(scripts/secret.sh set neodio-blob-rw)에서 읽는다.
set -e
cd "$(dirname "$0")/.."
version="$(sed -n 's/.*COLLECTOR_VERSION = "\([0-9.]*\)".*/\1/p' src/lib/collectorAgent.ts)"
BLOB_READ_WRITE_TOKEN="$(scripts/secret.sh get neodio-blob-rw)"
export BLOB_READ_WRITE_TOKEN
cd dist/collector
for f in neodio-collector-*-"$version".zip; do
  npx -y vercel@latest blob put "$f" --pathname "collector/$f" --access private --allow-overwrite true < /dev/null
done
