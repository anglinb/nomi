<p align="center">
  <img src="assets/icon.png" alt="Nomi" width="80" />
</p>

<h1 align="center">Nomi</h1>

<p align="center">
  <strong>A web IDE for Claude Code — editor, terminals, diffs, and chat in one place</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nomi-code"><img src="https://img.shields.io/npm/v/nomi-code.svg?style=flat&colorA=18181b&colorB=f472b6" alt="npm version" /></a>
</p>

> **Experimental fork of [Kanna](https://github.com/jakemor/kanna)** — this project builds on Kanna's excellent chat UI and agent coordination, adding embedded VS Code, standalone terminals, a diff viewer, and single-port multiplexing. Upstream changes are pulled in regularly. If you're looking for the stable original, head to [jakemor/kanna](https://github.com/jakemor/kanna).

<br />

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshot.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/screenshot-light.png" />
    <img src="assets/screenshot.png" alt="Nomi screenshot" width="800" />
  </picture>
</p>

<br />

## Quickstart

Install everything in one shot (Bun, Claude Code, and Nomi):

```bash
curl -fsSL https://raw.githubusercontent.com/anglinb/nomi/main/install.sh | bash
```

Or install manually:

```bash
curl -fsSL https://bun.sh/install | bash       # install Bun (if needed)
curl -fsSL https://claude.ai/install.sh | bash  # install Claude Code (if needed)
bun install -g nomi-code                        # install Nomi
```

Then run from any project directory:

```bash
nomi
```

Nomi opens in your browser at [`localhost:3210`](http://localhost:3210).

## What's in this fork

These features are **new in Nomi** on top of the upstream Kanna project:

- **Embedded VS Code** — a full VS Code editor runs inside Nomi, one instance per project, accessible from the sidebar
- **Standalone terminals** — terminals are first-class sidebar items with their own routes, not embedded in the chat view
- **Git diff viewer** — full-page diff viewer with file/chunk navigation, word-level highlighting, and inline comments
- **Single-port multiplexing** — VS Code, terminals, and Nomi all served through one port, so `--share` and reverse proxies just work
- **One-line installer** — `curl | bash` installs Bun, Claude Code, and Nomi in one shot
- **Sidebar toolbar** — quick-access buttons for Editor, Terminals, and Diffs with active-state indicators
- **Auto-create first chat** — a chat is created automatically on startup so you land in a ready-to-use session
- **Trusted npm publishing** — releases publish via GitHub Actions OIDC with provenance signing

## Features (from upstream)

- **Multi-provider support** — switch between Claude and Codex from the chat input, with per-provider model selection and reasoning effort controls
- **Project-first sidebar** — chats grouped under projects, with live status indicators (idle, running, waiting, failed)
- **Rich transcript rendering** — hydrated tool calls, collapsible tool groups, plan mode dialogs, and interactive prompts
- **Plan mode** — review and approve agent plans before execution
- **Persistent local history** — refresh-safe routes backed by JSONL event logs and compacted snapshots
- **Auto-generated titles** — chat titles generated in the background via Claude Haiku
- **Session resumption** — resume agent sessions with full context preservation
- **WebSocket-driven** — real-time subscription model with reactive state broadcasting
- **Public share links** — `--share` creates a temporary Cloudflare tunnel URL with terminal QR code

## Architecture

```
Browser (React + Zustand)
    ↕  WebSocket
Bun Server (HTTP + WS)
    ├── WSRouter ─── subscription & command routing
    ├── AgentCoordinator ─── multi-provider turn management
    ├── VsCodeProxy ─── reverse-proxy VS Code through same port
    ├── TerminalManager ─── PTY session lifecycle
    ├── EventStore ─── JSONL persistence + snapshot compaction
    └── ReadModels ─── derived views (sidebar, chat, projects)
    ↕  stdio / child process
Claude Agent SDK / Codex App Server / VS Code Server
    ↕
Local File System (~/.nomi/data/, project dirs)
```

## Requirements

- [Bun](https://bun.sh) v1.3.5+
- A working [Claude Code](https://docs.anthropic.com/en/docs/claude-code) environment
- *(Optional)* [Codex CLI](https://github.com/openai/codex) for Codex provider support

Embedded terminal support uses Bun's native PTY APIs and currently works on macOS/Linux.

## Usage

```bash
nomi                  # start with defaults (localhost only)
nomi --port 4000      # custom port
nomi --no-open        # don't open browser
nomi --share          # create a public share URL + terminal QR
```

Default URL: `http://localhost:3210`

### Network access (Tailscale / LAN)

By default Nomi binds to `127.0.0.1` (localhost only). Use `--host` to bind a specific interface, or `--remote` as a shorthand for `0.0.0.0`:

```bash
nomi --remote                     # bind all interfaces
nomi --host dev-box               # bind to a specific hostname
nomi --host 192.168.1.x           # bind to a specific LAN IP
nomi --host 100.64.x.x            # bind to a specific Tailscale IP
```

### Public share link

Use `--share` to create a temporary public `trycloudflare.com` URL and print a terminal QR code:

```bash
nomi --share
```

`--share` is incompatible with `--host` and `--remote`.

## Development

```bash
git clone https://github.com/anglinb/nomi.git
cd nomi
bun install
bun run dev
```

The same `--remote`, `--host`, and `--share` flags work in dev mode. Use `bun run dev --port 4000` to run the Vite client on `4000` and the backend on `4001`.

Or run client and server separately:

```bash
bun run dev:client   # Vite dev server
bun run dev:server   # Bun backend
```

## Scripts

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `bun run build`      | Build for production         |
| `bun run check`      | Typecheck + build            |
| `bun run dev`        | Run client + server together |
| `bun run dev:client` | Vite dev server only         |
| `bun run dev:server` | Bun backend only             |
| `bun run start`      | Start production server      |

## Data Storage

All state is stored locally at `~/.nomi/data/`:

| File             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `projects.jsonl` | Project open/remove events                |
| `chats.jsonl`    | Chat create/rename/delete events          |
| `messages.jsonl` | Transcript message entries                |
| `turns.jsonl`    | Agent turn start/finish/cancel events     |
| `snapshot.json`  | Compacted state snapshot for fast startup |

Event logs are append-only JSONL. On startup, Nomi replays the log tail after the last snapshot, then compacts if the logs exceed 2 MB.

## License

[MIT](LICENSE)
