#!/usr/bin/env bash
set -euo pipefail

# Build VS Code Server (REH Web) with the integration patch.
#
# This script produces the minimal VS Code web server that can be imported
# as an ESM module and controlled programmatically via IVSCodeServerAPI.
#
# Usage:
#   ./ci/build-vscode.sh
#
# Environment variables:
#   VSCODE_SERVER_PATH  - Skip building; use this pre-built VS Code server instead.
#                         e.g. ../code-server/lib/vscode-reh-web-darwin-arm64
#   VSCODE_SRC_PATH     - Path to VS Code source (default: ../code-server/lib/vscode)
#   PATCHES_PATH        - Path to patches dir (default: ../code-server/patches)
#   VSCODE_TARGET       - Build target (default: auto-detected from OS/arch)
#   MINIFY              - Set to "false" to skip minification (default: true)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOMI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$NOMI_ROOT/lib/vscode-server"

# If a pre-built path is provided, just symlink/copy it
if [[ -n "${VSCODE_SERVER_PATH:-}" ]]; then
  if [[ ! -d "$VSCODE_SERVER_PATH" ]]; then
    echo "Error: VSCODE_SERVER_PATH=$VSCODE_SERVER_PATH does not exist"
    exit 1
  fi

  echo "Using pre-built VS Code server at $VSCODE_SERVER_PATH"
  rm -rf "$OUTPUT_DIR"
  ln -sf "$(cd "$VSCODE_SERVER_PATH" && pwd)" "$OUTPUT_DIR"
  echo "Linked $OUTPUT_DIR -> $VSCODE_SERVER_PATH"
  exit 0
fi

# Auto-detect build target
detect_target() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    darwin) os="darwin" ;;
    linux)  os="linux" ;;
    *)      echo "Unsupported OS: $os"; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    armv7l)        arch="armhf" ;;
    *)             echo "Unsupported arch: $arch"; exit 1 ;;
  esac

  echo "${os}-${arch}"
}

VSCODE_TARGET="${VSCODE_TARGET:-$(detect_target)}"
MINIFY="${MINIFY:-true}"
VSCODE_SRC_PATH="${VSCODE_SRC_PATH:-$NOMI_ROOT/../code-server/lib/vscode}"
PATCHES_PATH="${PATCHES_PATH:-$NOMI_ROOT/../code-server/patches}"

if [[ ! -d "$VSCODE_SRC_PATH" ]]; then
  echo "Error: VS Code source not found at $VSCODE_SRC_PATH"
  echo ""
  echo "Either:"
  echo "  1. Set VSCODE_SRC_PATH to point to a VS Code source checkout"
  echo "  2. Set VSCODE_SERVER_PATH to point to a pre-built VS Code server"
  echo "  3. Ensure ../code-server/lib/vscode exists (run 'git submodule update --init' in code-server)"
  exit 1
fi

if [[ ! -f "$PATCHES_PATH/integration.diff" ]]; then
  echo "Error: integration.diff not found at $PATCHES_PATH/integration.diff"
  exit 1
fi

echo "=== Building VS Code Server ==="
echo "  Source:  $VSCODE_SRC_PATH"
echo "  Target:  $VSCODE_TARGET"
echo "  Minify:  $MINIFY"
echo "  Output:  $OUTPUT_DIR"
echo ""

# Work in the VS Code source directory
cd "$VSCODE_SRC_PATH"

# Get the commit to embed (use nomi's commit so cache-busting works on patch changes)
BUILD_SOURCEVERSION="$(cd "$NOMI_ROOT" && git rev-parse HEAD 2>/dev/null || echo "development")"
export BUILD_SOURCEVERSION

# Apply patches (only integration.diff is strictly required)
echo "Applying patches..."
ESSENTIAL_PATCHES=(
  "integration.diff"
  "base-path.diff"
  "marketplace.diff"
  "webview.diff"
)

for patch in "${ESSENTIAL_PATCHES[@]}"; do
  patch_file="$PATCHES_PATH/$patch"
  if [[ -f "$patch_file" ]]; then
    echo "  Applying $patch..."
    git apply --check "$patch_file" 2>/dev/null && git apply "$patch_file" || echo "  (already applied or skipped: $patch)"
  fi
done

# Customize product.json
echo "Configuring product.json..."
git checkout product.json 2>/dev/null || true
cp product.json product.original.json

VERSION="${VERSION:-0.0.0}"
jq --slurp '.[0] * .[1]' product.original.json <(cat << EOF
{
  "codeServerVersion": "$VERSION",
  "nameShort": "nomi-vscode",
  "nameLong": "nomi-vscode",
  "applicationName": "nomi-vscode",
  "dataFolderName": ".nomi-vscode",
  "quality": "stable",
  "enableTelemetry": false
}
EOF
) > product.json

# Build
echo "Building VS Code REH Web..."
npm run gulp core-ci
npm run gulp "vscode-reh-web-${VSCODE_TARGET}${MINIFY:+-min}-ci"

# Reset product.json so the source tree stays clean
git checkout product.json 2>/dev/null || true
rm -f product.original.json

# Move output to nomi's lib directory
BUILT_DIR="$(dirname "$VSCODE_SRC_PATH")/vscode-reh-web-${VSCODE_TARGET}"
if [[ ! -d "$BUILT_DIR" ]]; then
  echo "Error: Build output not found at $BUILT_DIR"
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mv "$BUILT_DIR" "$OUTPUT_DIR"

echo ""
echo "=== VS Code Server built successfully ==="
echo "  Output: $OUTPUT_DIR"
echo ""
echo "To use a pre-built version next time, set:"
echo "  VSCODE_SERVER_PATH=$OUTPUT_DIR"
