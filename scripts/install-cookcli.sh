#!/usr/bin/env bash
# Install a pinned CookCLI release binary for CI/local Linux x86_64.
# Override with COOK_VERSION=x.y.z if needed.
set -euo pipefail

COOK_VERSION="${COOK_VERSION:-0.33.1}"
ASSET="cook-x86_64-unknown-linux-gnu.tar.gz"
BASE_URL="https://github.com/cooklang/cookcli/releases/download/v${COOK_VERSION}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

cd "$TMPDIR"
curl -fsSL -o "$ASSET" "${BASE_URL}/${ASSET}"
curl -fsSL -o "${ASSET}.sha256" "${BASE_URL}/${ASSET}.sha256"

expected="$(tr -d '[:space:]' < "${ASSET}.sha256")"
actual="$(sha256sum "$ASSET" | awk '{print $1}')"
if [[ "$expected" != "$actual" ]]; then
  echo "CookCLI checksum mismatch for ${ASSET} (v${COOK_VERSION})" >&2
  echo "  expected: ${expected}" >&2
  echo "  actual:   ${actual}" >&2
  exit 1
fi

tar xz -f "$ASSET"
install -m 755 cook /usr/local/bin/cook
cook --version
