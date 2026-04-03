import type { ServerWebSocket } from "bun"
import { PROTOCOL_VERSION } from "../shared/types"
import type { ClientEnvelope, ServerEnvelope, SubscriptionTopic } from "../shared/protocol"
import { isClientEnvelope } from "../shared/protocol"
import type { AgentCoordinator } from "./agent"
import { EventStore } from "./event-store"
import { openExternal } from "./external-open"
import { KeybindingsManager } from "./keybindings"
import { TerminalManager } from "./terminal-manager"
import type { UpdateManager } from "./update-manager"
import { VsCodeManager } from "./vscode-manager"
import { deriveChatSnapshot, deriveSidebarData } from "./read-models"

export interface NomiClientState {
  type: "nomi"
  subscriptions: Map<string, SubscriptionTopic>
}

export interface VsCodeProxyState {
  type: "vscode-proxy"
  projectId: string
  upstreamUrl: string
  upstream: WebSocket | null
  buffer: (string | ArrayBuffer)[] | null
}

export type ClientState = NomiClientState | VsCodeProxyState

interface CreateWsRouterArgs {
  store: EventStore
  agent: AgentCoordinator
  terminals: TerminalManager
  keybindings: KeybindingsManager
  updateManager: UpdateManager | null
  vsCode: VsCodeManager
}

/** The router only handles nomi-protocol connections (server.ts dispatches vscode-proxy separately). */
type NomiSocket = ServerWebSocket<NomiClientState>

function send(ws: NomiSocket, message: ServerEnvelope) {
  ws.send(JSON.stringify(message))
}

export function createWsRouter({
  store,
  agent,
  terminals,
  keybindings,
  updateManager,
  vsCode,
}: CreateWsRouterArgs) {
  const sockets = new Set<NomiSocket>()

  function createEnvelope(id: string, topic: SubscriptionTopic): ServerEnvelope {
    if (topic.type === "sidebar") {
      return {
        v: PROTOCOL_VERSION,
        type: "snapshot",
        id,
        snapshot: {
          type: "sidebar",
          data: deriveSidebarData(store.state, agent.getActiveStatuses()),
        },
      }
    }

    if (topic.type === "keybindings") {
      return {
        v: PROTOCOL_VERSION,
        type: "snapshot",
        id,
        snapshot: {
          type: "keybindings",
          data: keybindings.getSnapshot(),
        },
      }
    }

    if (topic.type === "update") {
      return {
        v: PROTOCOL_VERSION,
        type: "snapshot",
        id,
        snapshot: {
          type: "update",
          data: updateManager?.getSnapshot() ?? {
            currentVersion: "unknown",
            latestVersion: null,
            status: "idle",
            updateAvailable: false,
            lastCheckedAt: null,
            error: null,
            installAction: "restart",
          },
        },
      }
    }

    if (topic.type === "terminal") {
      return {
        v: PROTOCOL_VERSION,
        type: "snapshot",
        id,
        snapshot: {
          type: "terminal",
          data: terminals.getSnapshot(topic.terminalId),
        },
      }
    }

    if (topic.type === "vscode") {
      return {
        v: PROTOCOL_VERSION,
        type: "snapshot",
        id,
        snapshot: {
          type: "vscode",
          data: vsCode.getSnapshot(topic.projectId),
        },
      }
    }

    return {
      v: PROTOCOL_VERSION,
      type: "snapshot",
      id,
      snapshot: {
        type: "chat",
        data: deriveChatSnapshot(store.state, agent.getActiveStatuses(), agent.getDrainingChatIds(), topic.chatId, (chatId) => store.getMessages(chatId)),
      },
    }
  }

  function pushSnapshots(ws: NomiSocket) {
    for (const [id, topic] of ws.data.subscriptions.entries()) {
      send(ws, createEnvelope(id, topic))
    }
  }

  function broadcastSnapshots() {
    for (const ws of sockets) {
      pushSnapshots(ws)
    }
  }

  function broadcastError(message: string) {
    for (const ws of sockets) {
      send(ws, {
        v: PROTOCOL_VERSION,
        type: "error",
        message,
      })
    }
  }

  function pushTerminalSnapshot(terminalId: string) {
    for (const ws of sockets) {
      for (const [id, topic] of ws.data.subscriptions.entries()) {
        if (topic.type !== "terminal" || topic.terminalId !== terminalId) continue
        send(ws, createEnvelope(id, topic))
      }
    }
  }

  function pushTerminalEvent(terminalId: string, event: Extract<ServerEnvelope, { type: "event" }>["event"]) {
    for (const ws of sockets) {
      for (const [id, topic] of ws.data.subscriptions.entries()) {
        if (topic.type !== "terminal" || topic.terminalId !== terminalId) continue
        send(ws, {
          v: PROTOCOL_VERSION,
          type: "event",
          id,
          event,
        })
      }
    }
  }

  function pushVsCodeSnapshot(projectId: string) {
    for (const ws of sockets) {
      for (const [id, topic] of ws.data.subscriptions.entries()) {
        if (topic.type !== "vscode" || topic.projectId !== projectId) continue
        send(ws, createEnvelope(id, topic))
      }
    }
  }

  const disposeTerminalEvents = terminals.onEvent((event) => {
    pushTerminalEvent(event.terminalId, event)
  })

  const disposeKeybindingEvents = keybindings.onChange(() => {
    for (const ws of sockets) {
      for (const [id, topic] of ws.data.subscriptions.entries()) {
        if (topic.type !== "keybindings") continue
        send(ws, createEnvelope(id, topic))
      }
    }
  })

  const disposeVsCodeEvents = vsCode.onChange((projectId) => {
    pushVsCodeSnapshot(projectId)
  })

  const disposeUpdateEvents = updateManager?.onChange(() => {
    for (const ws of sockets) {
      for (const [id, topic] of ws.data.subscriptions.entries()) {
        if (topic.type !== "update") continue
        send(ws, createEnvelope(id, topic))
      }
    }
  }) ?? (() => {})

  agent.setBackgroundErrorReporter?.(broadcastError)

  async function handleCommand(ws: NomiSocket, message: Extract<ClientEnvelope, { type: "command" }>) {
    const { command, id } = message
    try {
      switch (command.type) {
        case "system.ping": {
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          return
        }
        case "update.check": {
          const snapshot = updateManager
            ? await updateManager.checkForUpdates({ force: command.force })
            : {
                currentVersion: "unknown",
                latestVersion: null,
                status: "error",
                updateAvailable: false,
                lastCheckedAt: Date.now(),
                error: "Update manager unavailable.",
                installAction: "restart",
              }
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: snapshot })
          return
        }
        case "update.install": {
          if (!updateManager) {
            throw new Error("Update manager unavailable.")
          }
          const result = await updateManager.installUpdate()
          send(ws, {
            v: PROTOCOL_VERSION,
            type: "ack",
            id,
            result,
          })
          return
        }
        case "settings.readKeybindings": {
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: keybindings.getSnapshot() })
          return
        }
        case "settings.writeKeybindings": {
          const snapshot = await keybindings.write(command.bindings)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: snapshot })
          return
        }
        case "system.openExternal": {
          await openExternal(command)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.create": {
          const chat = await store.createChat(command.projectId ?? store.getDefaultProjectId())
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: { chatId: chat.id } })
          break
        }
        case "chat.rename": {
          await store.renameChat(command.chatId, command.title)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.delete": {
          await agent.cancel(command.chatId)
          await agent.closeChat(command.chatId)
          await store.deleteChat(command.chatId)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.markRead": {
          await store.setChatReadState(command.chatId, false)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.send": {
          const result = await agent.send(command)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result })
          break
        }
        case "chat.cancel": {
          await agent.cancel(command.chatId)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.stopDraining": {
          await agent.stopDraining(command.chatId)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "chat.respondTool": {
          await agent.respondTool(command)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          break
        }
        case "git.diff": {
          const project = store.getProject(command.projectId ?? store.getDefaultProjectId())
          if (!project) {
            throw new Error("Project not found")
          }
          const { execSync } = await import("child_process")
          let diff = ""
          try {
            diff = execSync("git diff HEAD --no-ext-diff --color=never", {
              cwd: project.localPath,
              encoding: "utf-8",
              maxBuffer: 10 * 1024 * 1024,
            })
          } catch (err) {
            // git diff exits 1 when there are differences in some configs,
            // but stdout still contains the diff.
            if (err && typeof err === "object" && "stdout" in err && typeof (err as { stdout: unknown }).stdout === "string") {
              diff = (err as { stdout: string }).stdout
            }
          }
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: { diff } })
          return
        }
        case "git.branch": {
          const project = store.getProject(command.projectId ?? store.getDefaultProjectId())
          if (!project) {
            throw new Error("Project not found")
          }
          const { execSync } = await import("child_process")
          let branch = ""
          try {
            branch = execSync("git rev-parse --abbrev-ref HEAD", {
              cwd: project.localPath,
              encoding: "utf-8",
              timeout: 5000,
            }).trim()
          } catch {
            // Not a git repo or git not available — leave empty
          }
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: { branch } })
          return
        }
        case "terminal.create": {
          const project = store.getProject(command.projectId ?? store.getDefaultProjectId())
          if (!project) {
            throw new Error("Project not found")
          }
          const snapshot = terminals.createTerminal({
            projectPath: project.localPath,
            terminalId: command.terminalId,
            cols: command.cols,
            rows: command.rows,
            scrollback: command.scrollback,
          })
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: snapshot })
          return
        }
        case "terminal.input": {
          terminals.write(command.terminalId, command.data)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          return
        }
        case "terminal.resize": {
          terminals.resize(command.terminalId, command.cols, command.rows)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          return
        }
        case "terminal.close": {
          terminals.close(command.terminalId)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          pushTerminalSnapshot(command.terminalId)
          return
        }
        case "vscode.start": {
          const project = store.getProject(command.projectId ?? store.getDefaultProjectId())
          if (!project) {
            throw new Error("Project not found")
          }
          const snapshot = await vsCode.start(project.id, project.localPath)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: snapshot })
          return
        }
        case "vscode.stop": {
          const projectId = command.projectId ?? store.getDefaultProjectId()
          vsCode.stop(projectId)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id })
          return
        }
        case "auth.setApiKey": {
          agent.setApiKey(command.apiKey)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result: { success: true } })
          return
        }
        case "auth.startLogin": {
          const result = await agent.startLogin()
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result })
          return
        }
        case "auth.submitOAuthCode": {
          const result = await agent.submitOAuthCode(command.code)
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result })
          return
        }
        case "auth.status": {
          const result = await agent.getAuthStatus()
          send(ws, { v: PROTOCOL_VERSION, type: "ack", id, result })
          return
        }
      }

      broadcastSnapshots()
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      send(ws, { v: PROTOCOL_VERSION, type: "error", id, message: messageText })
    }
  }

  return {
    handleOpen(ws: ServerWebSocket<ClientState>) {
      // Safe cast: server.ts guarantees only nomi connections reach the router
      sockets.add(ws as NomiSocket)
    },
    handleClose(ws: ServerWebSocket<ClientState>) {
      sockets.delete(ws as NomiSocket)
    },
    broadcastSnapshots,
    handleMessage(ws: ServerWebSocket<ClientState>, raw: string | Buffer | ArrayBuffer | Uint8Array) {
      const nws = ws as NomiSocket
      let parsed: unknown
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        send(nws, { v: PROTOCOL_VERSION, type: "error", message: "Invalid JSON" })
        return
      }

      if (!isClientEnvelope(parsed)) {
        send(nws, { v: PROTOCOL_VERSION, type: "error", message: "Invalid envelope" })
        return
      }

      if (parsed.type === "subscribe") {
        nws.data.subscriptions.set(parsed.id, parsed.topic)
        send(nws, createEnvelope(parsed.id, parsed.topic))
        return
      }

      if (parsed.type === "unsubscribe") {
        nws.data.subscriptions.delete(parsed.id)
        send(nws, { v: PROTOCOL_VERSION, type: "ack", id: parsed.id })
        return
      }

      void handleCommand(nws, parsed)
    },
    dispose() {
      agent.setBackgroundErrorReporter?.(null)
      disposeTerminalEvents()
      disposeVsCodeEvents()
      disposeKeybindingEvents()
      disposeUpdateEvents()
    },
  }
}
