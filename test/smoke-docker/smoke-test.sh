#!/usr/bin/env bash
# ============================================================================
# Nomi Docker Smoke Test
#
# Proves we can go from raw Ubuntu to a running Nomi server with zero
# interaction. Builds the frontend locally, creates a Docker image, starts
# the server, and verifies it serves traffic.
#
# Usage:
#   bash test/smoke-docker/smoke-test.sh              # automated (exit after PASS)
#   bash test/smoke-docker/smoke-test.sh --interactive # open browser for manual QA
#   bash test/smoke-docker/smoke-test.sh -i            # same as --interactive
#
# Environment:
#   NOMI_SMOKE_PORT  — fixed host port (default: auto-assigned by Docker)
# ============================================================================

set -euo pipefail

# ── Parse flags ────────────────────────────────────────────────────────────────

INTERACTIVE=false
for arg in "$@"; do
  case "$arg" in
    --interactive|-i) INTERACTIVE=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── Configuration ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

IMAGE_NAME="nomi-smoke-test"
IMAGE_TAG="$(date +%s)"
CONTAINER_NAME="nomi-smoke-$$"
HOST_PORT="${NOMI_SMOKE_PORT:-0}"   # 0 = let Docker pick a free port
CONTAINER_PORT=3210
HEALTH_TIMEOUT=30                   # seconds to wait for /health

# ── Helpers ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${CYAN}[smoke]${RESET} %s\n" "$*"; }
success() { printf "${GREEN}[smoke]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[smoke]${RESET} %s\n" "$*"; }
fail()    { printf "${RED}[smoke] FAIL:${RESET} %s\n" "$*" >&2; }

# ── Cleanup Trap ───────────────────────────────────────────────────────────────

cleanup() {
  info "Cleaning up..."
  if docker ps -q --filter "name=$CONTAINER_NAME" 2>/dev/null | grep -q .; then
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if docker ps -aq --filter "name=$CONTAINER_NAME" 2>/dev/null | grep -q .; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if docker image inspect "$IMAGE_NAME:$IMAGE_TAG" >/dev/null 2>&1; then
    docker rmi "$IMAGE_NAME:$IMAGE_TAG" >/dev/null 2>&1 || true
  fi
  info "Cleanup complete."
}

trap cleanup EXIT

# ── Preflight Checks ──────────────────────────────────────────────────────────

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is not installed or not on PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not running."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  fail "Bun is not installed or not on PATH."
  exit 1
fi

# ── Step 1: Build frontend locally ────────────────────────────────────────────

info "Step 1/5: Building frontend bundle..."
cd "$PROJECT_ROOT"
bun run build

if [ ! -f "$PROJECT_ROOT/dist/client/index.html" ]; then
  fail "Frontend build did not produce dist/client/index.html"
  exit 1
fi
success "Frontend bundle built."

# ── Step 2: Build Docker image ────────────────────────────────────────────────

info "Step 2/5: Building Docker image ($IMAGE_NAME:$IMAGE_TAG)..."
docker build \
  -t "$IMAGE_NAME:$IMAGE_TAG" \
  -f "$SCRIPT_DIR/Dockerfile" \
  "$PROJECT_ROOT"
success "Docker image built."

# ── Step 3: Start container ───────────────────────────────────────────────────

info "Step 3/5: Starting container..."

if [ "$HOST_PORT" = "0" ]; then
  # Let Docker pick a free port
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$CONTAINER_PORT" \
    "$IMAGE_NAME:$IMAGE_TAG"

  # Discover the actual mapped port
  HOST_PORT=$(docker port "$CONTAINER_NAME" "$CONTAINER_PORT/tcp" | head -1 | cut -d: -f2)
else
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$HOST_PORT:$CONTAINER_PORT" \
    "$IMAGE_NAME:$IMAGE_TAG"
fi

info "Container started, mapped to localhost:$HOST_PORT"

# ── Step 4: Wait for health check ────────────────────────────────────────────

info "Step 4/5: Waiting for health check (timeout: ${HEALTH_TIMEOUT}s)..."

health_url="http://localhost:$HOST_PORT/health"
elapsed=0
response=""

while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  # Detect container crash
  if ! docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
    fail "Container exited prematurely."
    info "Container logs:"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -30
    exit 1
  fi

  response=$(curl -sf "$health_url" 2>/dev/null || true)
  if [ -n "$response" ]; then
    if echo "$response" | grep -q '"ok":true'; then
      success "Health check passed: $response"
      break
    fi
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
  fail "Health check timed out after ${HEALTH_TIMEOUT}s."
  info "Last response: ${response:-<none>}"
  info "Container logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -30
  exit 1
fi

# ── Step 5: Verify SPA page loads ─────────────────────────────────────────────

info "Step 5/5: Verifying SPA page loads..."

page_url="http://localhost:$HOST_PORT/"
page_response=$(curl -sf "$page_url" 2>/dev/null || true)

if [ -z "$page_response" ]; then
  fail "Root URL returned empty response."
  exit 1
fi

if ! echo "$page_response" | grep -q '<div id="root">'; then
  fail "Root URL response does not contain SPA mount point (<div id=\"root\">)."
  echo "$page_response" | head -20
  exit 1
fi

if ! echo "$page_response" | grep -q '<script'; then
  fail "Root URL response does not contain script tags (JS bundle missing)."
  exit 1
fi

success "SPA page loads correctly."

# ── Result ─────────────────────────────────────────────────────────────────────

echo ""
printf "${BOLD}${GREEN}  PASS${RESET} — Nomi starts successfully from raw Ubuntu in Docker.\n"
echo ""
printf "  Health:  %s -> %s\n" "$health_url" "$response"
printf "  SPA:     %s -> HTML with React mount + JS bundle\n" "$page_url"
echo ""

# ── Interactive mode: keep running for manual QA ──────────────────────────────

if [ "$INTERACTIVE" = true ]; then
  app_url="http://localhost:$HOST_PORT"

  printf "${BOLD}${CYAN}  Interactive mode — server is running at ${app_url}${RESET}\n"
  echo ""

  # Open browser (macOS: open, Linux: xdg-open)
  if command -v open >/dev/null 2>&1; then
    open "$app_url"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$app_url"
  else
    info "Could not auto-open browser. Visit $app_url manually."
  fi

  printf "  Press ${BOLD}Enter${RESET} to stop the container and clean up..."
  read -r
  echo ""
  info "Shutting down..."
fi
