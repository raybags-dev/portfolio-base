#!/usr/bin/env bash
# Fetch a pinned terraform binary into ./tools/ (repo-local, gitignored) when
# terraform is not already on PATH. Nothing is installed system-wide.
set -Eeuo pipefail

TF_VERSION="1.10.5"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tools"

if command -v terraform >/dev/null 2>&1; then
  echo "terraform already installed: $(terraform version | head -1)"
  exit 0
fi

mkdir -p "$TOOLS_DIR"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

URL="https://releases.hashicorp.com/terraform/${TF_VERSION}/terraform_${TF_VERSION}_${OS}_${ARCH}.zip"
echo "downloading $URL"
curl -fsSL "$URL" -o "$TOOLS_DIR/terraform.zip"
unzip -o "$TOOLS_DIR/terraform.zip" -d "$TOOLS_DIR" >/dev/null
rm "$TOOLS_DIR/terraform.zip"
chmod +x "$TOOLS_DIR/terraform"
"$TOOLS_DIR/terraform" version | head -1
echo "installed to $TOOLS_DIR/terraform"
