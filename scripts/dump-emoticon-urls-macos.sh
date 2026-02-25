#!/usr/bin/env bash
set -euo pipefail

WECHAT_APP="${1:-/Applications/WeChat.app}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OUT_DIR="$HOME/Library/Containers/com.tencent.xinWeChat/Data/Documents/export-wechat-emoji"
OUT_FILE="$OUT_DIR/emoticon_urls.txt"
LOG_FILE="$OUT_DIR/emoticon_urls.log"
KEY_FILE="$OUT_DIR/emoticon_dbkey.txt"

mkdir -p "$OUT_DIR"

if [[ ! -d "$WECHAT_APP" ]]; then
  echo "WeChat.app not found: $WECHAT_APP" >&2
  exit 1
fi

rm -f "$OUT_FILE"
rm -f "$LOG_FILE"
: >"$LOG_FILE"

normalize_key() {
  local s="$1"
  s="${s//$'\r'/}"
  s="${s//$'\n'/}"
  s="${s// /}"
  s="${s#0x}"
  s="${s#0X}"
  printf '%s' "$s" | tr 'A-F' 'a-f'
}

is_valid_key() {
  local k
  k="$(normalize_key "$1")"
  [[ "$k" =~ ^[0-9a-f]{64}$ ]]
}

DB_KEY=""
if [[ -f "$KEY_FILE" ]]; then
  maybe="$(head -n 1 "$KEY_FILE" 2>/dev/null || true)"
  if is_valid_key "$maybe"; then
    DB_KEY="$(normalize_key "$maybe")"
    echo "Using existing db key: $KEY_FILE" >&2
  fi
fi

if [[ -z "$DB_KEY" ]]; then
  echo "Fetching db key (no SIP required)..." >&2
  echo "If it doesn't appear quickly, login and open the emoji panel once." >&2
  DB_KEY="$(bash "$ROOT_DIR/scripts/dump-emoticon-db-key-macos.sh" "$WECHAT_APP")"
  DB_KEY="$(normalize_key "$DB_KEY")"
fi

if ! is_valid_key "$DB_KEY"; then
  echo "Failed to get a valid db key. Check: $KEY_FILE" >&2
  exit 1
fi

BASE_DIR="$HOME/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files"
shopt -s nullglob
DBS=("$BASE_DIR"/wxid_*/db_storage/emoticon/emoticon.db)
shopt -u nullglob

if [[ ${#DBS[@]} -eq 0 ]]; then
  echo "No emoticon.db found under: $BASE_DIR" >&2
  exit 1
fi

echo "Found ${#DBS[@]} emoticon.db file(s)." >&2

# Build / locate the offline extractor (Rust) once, then run it for every db.
BIN=""
if [[ -x "$ROOT_DIR/src-tauri/target/release/extract-emoticon-urls" ]]; then
  BIN="$ROOT_DIR/src-tauri/target/release/extract-emoticon-urls"
elif [[ -x "$ROOT_DIR/src-tauri/target/debug/extract-emoticon-urls" ]]; then
  BIN="$ROOT_DIR/src-tauri/target/debug/extract-emoticon-urls"
elif command -v cargo >/dev/null 2>&1; then
  echo "Building offline extractor (first time may take a while)..." >&2
  (cd "$ROOT_DIR/src-tauri" && cargo build --quiet --bin extract-emoticon-urls)
  BIN="$ROOT_DIR/src-tauri/target/debug/extract-emoticon-urls"
fi

if [[ -z "$BIN" || ! -x "$BIN" ]]; then
  echo "Offline extractor not available (missing Rust toolchain)." >&2
  echo "You can still use the app UI: load db key from $KEY_FILE, then export." >&2
  exit 1
fi

TMP_OUT="$(mktemp)"
cleanup_tmp() {
  rm -f "$TMP_OUT" >/dev/null 2>&1 || true
}
trap cleanup_tmp EXIT

success=0
for db in "${DBS[@]}"; do
  echo "[info] extracting urls from: $db" >>"$LOG_FILE"
  if "$BIN" "$db" "$DB_KEY" >>"$TMP_OUT" 2>>"$LOG_FILE"; then
    success=1
  else
    echo "[warn] failed to extract from: $db" >>"$LOG_FILE"
  fi
done

if [[ "$success" -ne 1 ]]; then
  echo "Failed to extract URLs from all emoticon.db files. Check: $LOG_FILE" >&2
  exit 1
fi

# De-duplicate while preserving first-seen order.
awk 'NF { gsub(/\r/, ""); if (!seen[$0]++) print }' "$TMP_OUT" >"$OUT_FILE"

if [[ ! -s "$OUT_FILE" ]]; then
  echo "No URLs extracted. Check: $LOG_FILE" >&2
  exit 1
fi

echo "URLs written to: $OUT_FILE" >&2
cat "$OUT_FILE"
