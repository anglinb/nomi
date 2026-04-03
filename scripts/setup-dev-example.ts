/**
 * Creates a `dev-example/` directory with a small git history so that
 * `bun run dev` has a realistic project to point at via --dir.
 *
 * If `dev-example/.git` already exists the script exits immediately.
 */

import path from "node:path"
import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { LOG_PREFIX } from "../src/shared/branding"

const ROOT = path.resolve(import.meta.dirname, "..")
const DEV_EXAMPLE_DIR = path.join(ROOT, "dev-example")

export const DEV_EXAMPLE_PATH = DEV_EXAMPLE_DIR

export function ensureDevExample() {
  if (fs.existsSync(path.join(DEV_EXAMPLE_DIR, ".git"))) {
    return
  }

  console.log(`${LOG_PREFIX} creating dev-example project with git history…`)

  fs.mkdirSync(DEV_EXAMPLE_DIR, { recursive: true })

  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: DEV_EXAMPLE_DIR, stdio: "pipe" })
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim()
      throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`)
    }
  }

  const write = (relPath: string, content: string) => {
    const full = path.join(DEV_EXAMPLE_DIR, relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }

  // ── init ───────────────────────────────────────────────────────────
  git("init", "-b", "main")
  git("config", "user.email", "dev@example.com")
  git("config", "user.name", "Dev Example")

  // ── commit 1: Initial commit ──────────────────────────────────────
  write(
    "README.md",
    `# Example Project

A small demo project used for local Nomi development.
`,
  )
  write(
    "package.json",
    JSON.stringify(
      { name: "dev-example", version: "0.1.0", private: true, type: "module" },
      null,
      2,
    ) + "\n",
  )
  git("add", "-A")
  git("commit", "-m", "Initial commit")

  // ── commit 2: Add main application file ───────────────────────────
  write(
    "src/index.ts",
    `export function greet(name: string) {
  return \`Hello, \${name}!\`
}

console.log(greet("world"))
`,
  )
  git("add", "-A")
  git("commit", "-m", "Add main application file")

  // ── commit 3: Add utility helpers ─────────────────────────────────
  write(
    "src/utils.ts",
    `export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}
`,
  )
  git("add", "-A")
  git("commit", "-m", "Add utility helpers")

  // ── commit 4: Add configuration ───────────────────────────────────
  write(
    "config.json",
    JSON.stringify(
      { port: 3000, debug: false, logLevel: "info" },
      null,
      2,
    ) + "\n",
  )
  write(
    ".gitignore",
    `node_modules/
dist/
.env
`,
  )
  git("add", "-A")
  git("commit", "-m", "Add configuration")

  // ── commit 5: Fix typo in README ──────────────────────────────────
  write(
    "README.md",
    `# Example Project

A small demo project used for local Nomi development.

## Getting Started

Run the app with:

\`\`\`sh
bun run src/index.ts
\`\`\`
`,
  )
  git("add", "-A")
  git("commit", "-m", "Fix typo in README and add getting started section")

  console.log(`${LOG_PREFIX} dev-example project ready`)
}
