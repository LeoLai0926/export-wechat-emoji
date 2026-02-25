#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/wechat_key_dumper.dylib"

clang \
  -dynamiclib \
  -O2 \
  -fvisibility=hidden \
  -o "$OUT" \
  "$DIR/key_dumper.c" \
  -arch arm64 -arch x86_64 \
  -mmacosx-version-min=11.0

echo "built: $OUT"

