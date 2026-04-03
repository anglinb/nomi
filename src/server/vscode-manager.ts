import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"
import os from "node:os"
import type { VsCodeSnapshot } from "../shared/protocol"

interface VsCodeSession {
  projectId: string
  cwd: string
  port: number
  status: "starting" | "running" | "error" | "stopped"
  child: ChildProcess | null
  error: string | null
}

function resolveVsCodeServerPath(): string {
  if (process.env.VSCODE_SERVER_PATH) {
    return process.env.VSCODE_SERVER_PATH
  }
  return path.join(import.meta.dir, "..", "..", "lib", "vscode-server")
}

function getVsCodeDataDir(): string {
  return path.join(os.homedir(), ".nomi", "vscode-data")
}

function getVsCodeExtensionsDir(): string {
  return path.join(os.homedir(), ".nomi", "vscode-extensions")
}

/**
 * Resolve the path to the Node.js binary.
 *
 * The built VS Code REH Web package includes its own Node binary.
 * We prefer that to ensure version compatibility with VS Code's internals.
 * Falls back to the system `node` if the bundled one isn't found.
 */
function resolveNodePath(): string {
  const vsCodeRoot = resolveVsCodeServerPath()

  // VS Code REH Web bundles Node at: <root>/node
  const bundledNode = path.join(vsCodeRoot, "node")
  try {
    const stat = require("node:fs").statSync(bundledNode)
    if (stat.isFile()) return bundledNode
  } catch {}

  // Fall back to system node
  return process.env.NODE_EXEC_PATH || "node"
}

/**
 * Manages VS Code server instances. Each project gets its own VS Code server
 * running in a **separate Node.js child process** (not Bun) because VS Code's
 * WebSocket upgrade handling requires real Node.js net.Socket support.
 *
 * Follows the same pattern as TerminalManager.
 */
export class VsCodeManager {
  private readonly sessions = new Map<string, VsCodeSession>()
  private readonly listeners = new Set<(projectId: string) => void>()

  onChange(listener: (projectId: string) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async start(projectId: string, cwd: string): Promise<VsCodeSnapshot> {
    const existing = this.sessions.get(projectId)
    if (existing && (existing.status === "running" || existing.status === "starting")) {
      return this.snapshotOf(existing)
    }

    if (existing) {
      this.cleanupSession(existing)
    }

    const session: VsCodeSession = {
      projectId,
      cwd,
      port: 0,
      status: "starting",
      child: null,
      error: null,
    }
    this.sessions.set(projectId, session)
    this.emit(projectId)

    try {
      await this.spawnServer(session)
    } catch (error) {
      session.status = "error"
      session.error = error instanceof Error ? error.message : String(error)
      this.emit(projectId)
    }

    return this.snapshotOf(session)
  }

  stop(projectId: string) {
    const session = this.sessions.get(projectId)
    if (!session) return

    this.cleanupSession(session)
    session.status = "stopped"
    session.error = null
    this.sessions.delete(projectId)
    this.emit(projectId)
  }

  stopAll() {
    for (const projectId of [...this.sessions.keys()]) {
      this.stop(projectId)
    }
  }

  getSnapshot(projectId: string): VsCodeSnapshot | null {
    const session = this.sessions.get(projectId)
    return session ? this.snapshotOf(session) : null
  }

  /** Quick port lookup for the reverse proxy — returns null if not running. */
  getPort(projectId: string): number | null {
    const session = this.sessions.get(projectId)
    return session?.status === "running" ? session.port : null
  }

  private snapshotOf(session: VsCodeSession): VsCodeSnapshot {
    return {
      projectId: session.projectId,
      status: session.status,
      port: session.status === "running" ? session.port : null,
      cwd: session.cwd,
      error: session.error,
    }
  }

  private spawnServer(session: VsCodeSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const nodePath = resolveNodePath()
      const scriptPath = path.join(import.meta.dir, "vscode-server-process.mjs")
      const vsCodePath = resolveVsCodeServerPath()

      const child = spawn(nodePath, [scriptPath], {
        stdio: ["pipe", "inherit", "inherit", "ipc"],
        env: {
          ...process.env,
          // Prevent VS Code from auto-starting
          CODE_SERVER_PARENT_PID: process.pid.toString(),
        },
      })

      session.child = child

      let settled = false

      child.on("message", (msg: { type: string; port?: number; message?: string }) => {
        if (msg.type === "ready" && !settled) {
          settled = true
          session.port = msg.port!
          session.status = "running"
          this.emit(session.projectId)
          resolve()
        } else if (msg.type === "error" && !settled) {
          settled = true
          session.status = "error"
          session.error = msg.message ?? "Unknown error"
          this.emit(session.projectId)
          reject(new Error(session.error))
        }
      })

      child.on("exit", (code, signal) => {
        if (!settled) {
          settled = true
          session.status = "error"
          session.error = `VS Code process exited with code ${code} (signal: ${signal})`
          this.emit(session.projectId)
          reject(new Error(session.error))
        } else {
          // Process exited after it was running
          const active = this.sessions.get(session.projectId)
          if (active && active === session) {
            active.status = "error"
            active.error = `VS Code process exited unexpectedly (code ${code})`
            this.emit(session.projectId)
          }
        }
      })

      child.on("error", (err) => {
        if (!settled) {
          settled = true
          session.status = "error"
          session.error = err.message
          this.emit(session.projectId)
          reject(err)
        }
      })

      // Send the start command to the child
      child.send({
        type: "start",
        vsCodePath,
        cwd: session.cwd,
        userDataDir: getVsCodeDataDir(),
        extensionsDir: getVsCodeExtensionsDir(),
      })
    })
  }

  private cleanupSession(session: VsCodeSession) {
    if (session.child) {
      try {
        // Ask nicely first
        session.child.send({ type: "stop" })
        // Give it a moment, then force kill
        setTimeout(() => {
          try { session.child?.kill("SIGKILL") } catch {}
        }, 3000)
      } catch {
        try { session.child.kill("SIGKILL") } catch {}
      }
      session.child = null
    }
  }

  private emit(projectId: string) {
    for (const listener of this.listeners) {
      listener(projectId)
    }
  }
}
