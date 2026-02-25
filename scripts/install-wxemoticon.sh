#!/usr/bin/env bash
set -euo pipefail

# wxemoticon installer (macOS only)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/liusheng22/export-wechat-emoji/main/scripts/install-wxemoticon.sh | bash
#
# Options:
#   INSTALL_DIR=~/.local/bin
#   WXEMOTICON_VERSION=v0.1.0   # default: latest
#   WXEMOTICON_REPO=liusheng22/export-wechat-emoji

REPO="${WXEMOTICON_REPO:-liusheng22/export-wechat-emoji}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${WXEMOTICON_VERSION:-latest}"

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Darwin" ]]; then
  echo "仅支持 macOS（当前：$OS）" >&2
  exit 1
fi

case "$ARCH" in
  arm64) TARGET="aarch64-apple-darwin" ;;
  x86_64) TARGET="x86_64-apple-darwin" ;;
  *)
    echo "不支持的架构：$ARCH" >&2
    exit 1
    ;;
esac

ASSET="wxemoticon-${TARGET}.tar.gz"

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "下载：$URL" >&2
curl -fL --retry 3 --retry-delay 1 -o "$TMP_DIR/$ASSET" "$URL"

mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP_DIR/$ASSET" -C "$TMP_DIR"

if [[ ! -f "$TMP_DIR/wxemoticon" ]]; then
  echo "安装包结构不正确：缺少 wxemoticon" >&2
  exit 1
fi

install -m 0755 "$TMP_DIR/wxemoticon" "$INSTALL_DIR/wxemoticon"

echo "安装完成：$INSTALL_DIR/wxemoticon" >&2
echo "验证：wxemoticon --help" >&2

if ! command -v wxemoticon >/dev/null 2>&1; then
  echo "" >&2
  echo "提示：你的 PATH 里可能还没有 $INSTALL_DIR" >&2
  echo "可把下面这行加到 ~/.zshrc 然后重新打开终端：" >&2
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\"" >&2
fi
