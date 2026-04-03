#!/usr/bin/env bash
# Nomi installer — installs Bun, Claude Code, and Nomi in one shot.
# Usage: curl -fsSL https://raw.githubusercontent.com/anglinb/nomi/main/install.sh | bash
set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

info()    { printf "${CYAN}[nomi]${RESET} %s\n" "$*"; }
success() { printf "${GREEN}[nomi]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[nomi]${RESET} %s\n" "$*"; }
error()   { printf "${RED}[nomi]${RESET} %s\n" "$*" >&2; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ── 1. Bun ───────────────────────────────────────────────────────────────────

install_bun() {
  if command_exists bun; then
    local bun_version
    bun_version=$(bun --version 2>/dev/null || echo "0.0.0")
    info "Bun ${bun_version} is already installed"
  else
    info "Installing Bun…"
    curl -fsSL https://bun.sh/install | bash

    # Source the updated shell profile so bun is on PATH for the rest of this script
    export BUN_INSTALL="${HOME}/.bun"
    export PATH="${BUN_INSTALL}/bin:${PATH}"

    if command_exists bun; then
      success "Bun $(bun --version) installed"
    else
      error "Bun installation failed. Please install manually: https://bun.sh"
      exit 1
    fi
  fi
}

# ── 2. Claude Code ──────────────────────────────────────────────────────────

install_claude_code() {
  if command_exists claude; then
    local claude_version
    claude_version=$(claude --version 2>/dev/null | head -1 || echo "unknown")
    info "Claude Code is already installed (${claude_version})"
  else
    info "Installing Claude Code…"
    curl -fsSL https://claude.ai/install.sh | bash

    # Source the updated PATH (the Claude installer puts it in ~/.local/bin)
    export PATH="${HOME}/.local/bin:${PATH}"

    if command_exists claude; then
      success "Claude Code installed ($(claude --version 2>/dev/null | head -1))"
    else
      warn "Claude Code auto-install did not succeed."
      warn "You can install it manually later: curl -fsSL https://claude.ai/install.sh | bash"
    fi
  fi
}

# ── 3. Nomi ─────────────────────────────────────────────────────────────────

install_nomi() {
  info "Installing nomi-code…"
  bun install -g nomi-code

  if command_exists nomi; then
    success "nomi $(nomi --version 2>/dev/null) installed"
  else
    # bun global bin may not be on PATH yet
    local bun_bin="${HOME}/.bun/bin"
    if [ -x "${bun_bin}/nomi" ]; then
      warn "nomi was installed but ${bun_bin} is not in your PATH."
      warn "Add this to your shell profile:"
      echo ""
      printf "  ${BOLD}export PATH=\"%s:\$PATH\"${RESET}\n" "${bun_bin}"
      echo ""
    else
      error "nomi installation failed."
      exit 1
    fi
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo ""
  printf "${BOLD}${CYAN}  ╔══════════════════════════════╗${RESET}\n"
  printf "${BOLD}${CYAN}  ║     Nomi Installer           ║${RESET}\n"
  printf "${BOLD}${CYAN}  ║  Web UI for Claude Code      ║${RESET}\n"
  printf "${BOLD}${CYAN}  ╚══════════════════════════════╝${RESET}\n"
  echo ""

  install_bun
  install_claude_code
  install_nomi

  echo ""
  printf "${BOLD}${GREEN}  ✓ All done!${RESET}\n"
  echo ""
  info "Run ${BOLD}nomi${RESET} to start the web UI."
  info "Run ${BOLD}nomi --help${RESET} for options (port, remote, share, etc.)"
  echo ""
}

main "$@"
