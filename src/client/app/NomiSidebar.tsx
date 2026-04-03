import { useCallback, useEffect, useRef, useState } from "react"
import { Code2, GitCompareArrows, Loader2, PanelLeft, Terminal, X, Menu, Plus, Settings } from "lucide-react"
import { NomiIcon } from "../components/ui/nomi-icon"
import { useLocation, useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"
import { ChatRow } from "../components/chat-ui/sidebar/ChatRow"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import type { SidebarData, SidebarChatRow, UpdateSnapshot } from "../../shared/types"
import type { SocketStatus } from "./socket"

interface NomiSidebarProps {
  data: SidebarData
  activeChatId: string | null
  connectionStatus: SocketStatus
  ready: boolean
  open: boolean
  collapsed: boolean
  onOpen: () => void
  onClose: () => void
  onCollapse: () => void
  onExpand: () => void
  onCreateChat: () => void
  onDeleteChat: (chat: SidebarChatRow) => void
  updateSnapshot: UpdateSnapshot | null
  onInstallUpdate: () => void
}

export function NomiSidebar({
  data,
  activeChatId,
  connectionStatus,
  ready,
  open,
  collapsed,
  onOpen,
  onClose,
  onCollapse,
  onExpand,
  onCreateChat,
  onDeleteChat,
  updateSnapshot,
  onInstallUpdate,
}: NomiSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  // Terminal state from Zustand store (client-side)
  const terminalProjects = useTerminalLayoutStore((store) => store.projects)
  const addTerminal = useTerminalLayoutStore((store) => store.addTerminal)
  const removeTerminal = useTerminalLayoutStore((store) => store.removeTerminal)

  // Collect all terminals across all projects
  const allTerminals = Object.entries(terminalProjects).flatMap(([projectId, layout]) =>
    layout.terminals.map((t) => ({ ...t, projectId }))
  )

  const activeVisibleCount = data.chats.length
  const activeTerminalId = location.pathname.startsWith("/terminal/")
    ? location.pathname.split("/terminal/")[1]
    : null

  const renderChatRow = useCallback((chat: SidebarChatRow) => (
    <ChatRow
      key={chat._id}
      chat={chat}
      activeChatId={activeChatId}
      nowMs={nowMs}
      onSelectChat={(chatId) => {
        navigate(`/chat/${chatId}`)
        onClose()
      }}
      onDeleteChat={() => onDeleteChat(chat)}
    />
  ), [activeChatId, navigate, nowMs, onClose, onDeleteChat])

  const handleCreateTerminal = useCallback(() => {
    const projectId = "default"
    addTerminal(projectId)
    // Get the newly created terminal's ID from the store
    const layout = useTerminalLayoutStore.getState().projects[projectId]
    if (layout && layout.terminals.length > 0) {
      const newTerminal = layout.terminals[layout.terminals.length - 1]
      navigate(`/terminal/${newTerminal.id}`)
      onClose()
    }
  }, [addTerminal, navigate, onClose])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!activeChatId || !scrollContainerRef.current) return

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      const activeElement = container?.querySelector(`[data-chat-id="${activeChatId}"]`) as HTMLElement | null
      if (!activeElement || !container) return

      const elementRect = activeElement.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (elementRect.top < containerRect.top + 38) {
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop
        container.scrollTo({ top: relativeTop - 38, behavior: "smooth" })
      } else if (elementRect.bottom > containerRect.bottom) {
        const elementCenter = elementRect.top + elementRect.height / 2 - containerRect.top + container.scrollTop
        const containerCenter = container.clientHeight / 2
        container.scrollTo({ top: elementCenter - containerCenter, behavior: "smooth" })
      }
    })
  }, [activeChatId, activeVisibleCount])

  const hasVisibleChats = activeVisibleCount > 0
  const isSettingsActive = location.pathname.startsWith("/settings")
  const isVsCodeActive = location.pathname === "/vscode"
  const isDiffsActive = location.pathname === "/diffs"
  const isTerminalRoute = location.pathname.startsWith("/terminal")
  const isUtilityPageActive = isSettingsActive || isVsCodeActive || isDiffsActive || isTerminalRoute
  const isConnecting = connectionStatus === "connecting" || !ready
  const statusLabel = isConnecting ? "Connecting" : connectionStatus === "connected" ? "Connected" : "Disconnected"
  const statusDotClass = connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
  const showUpdateButton = updateSnapshot?.updateAvailable === true
  const showDevBadge = updateSnapshot
    ? updateSnapshot.latestVersion === `${updateSnapshot.currentVersion}-dev`
    : false
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"

  return (
    <>
      {!open && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 md:hidden"
          onClick={onOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {collapsed && isUtilityPageActive && (
        <div className="hidden md:flex fixed left-0 top-0 h-full z-40 items-start pt-4 pl-5 border-l border-border/0">
          <div className="flex items-center gap-1">
            <NomiIcon className="size-6 text-logo" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpand}
              title="Expand sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      <div
        data-sidebar="open"
        className={cn(
          "fixed inset-0 z-50 bg-background dark:bg-card flex flex-col h-[100dvh] select-none",
          "md:relative md:inset-auto md:w-[275px] md:mr-0 md:h-[calc(100dvh-16px)] md:my-2 md:ml-2 md:border md:border-border md:rounded-2xl",
          open ? "flex" : "hidden md:flex",
          collapsed && "md:hidden"
        )}
      >
        <div className=" pl-3 pr-[7px] h-[64px] max-h-[64px] md:h-[55px] md:max-h-[55px] border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse sidebar"
              className="hidden md:flex group/sidebar-collapse relative items-center justify-center h-5 w-5 sm:h-6 sm:w-6"
            >
              <NomiIcon className="absolute inset-0.5 h-4 w-4 sm:h-5 sm:w-5 text-logo transition-all duration-200 ease-out opacity-100 scale-100 group-hover/sidebar-collapse:opacity-0 group-hover/sidebar-collapse:scale-0" />
              <PanelLeft className="absolute inset-0 h-4 w-4 sm:h-6 sm:w-6 text-slate-500 dark:text-slate-400 transition-all duration-200 ease-out opacity-0 scale-0 group-hover/sidebar-collapse:opacity-100 group-hover/sidebar-collapse:scale-80 hover:opacity-50" />
            </button>
            <NomiIcon className="h-5 w-5 sm:h-6 sm:w-6 text-logo md:hidden" />
            <span className="font-logo text-base uppercase sm:text-md text-slate-600 dark:text-slate-100">{APP_NAME}</span>

          </div>
          <div className="flex items-center">
            {showDevBadge ? (
              <span
                className="mr-1 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold tracking-wider text-muted-foreground"
                title="Development build"
              >
                DEV
              </span>
            ) : showUpdateButton ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full !h-auto mr-1 py-0.5 px-2 bg-logo/20 hover:bg-logo text-logo border-logo/20 hover:text-foreground hover:border-logo/20  text-[11px] font-bold tracking-wider"
                onClick={onInstallUpdate}
                disabled={isUpdating}
                title={updateSnapshot?.latestVersion ? `Update to ${updateSnapshot.latestVersion}` : "Update Nomi"}
              >
                {isUpdating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                UPDATE
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                onCreateChat()
              }}
              className="size-10 rounded-lg"
              title="New chat"
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tool buttons — Editor + Diffs */}
        <div className="flex items-center gap-1 px-[7px] pt-[7px]">
          <button
            type="button"
            onClick={() => { navigate("/vscode"); onClose() }}
            title="VS Code"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
              isVsCodeActive
                ? "bg-muted border-border text-foreground"
                : "border-border/0 text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Editor</span>
          </button>
          <button
            type="button"
            onClick={() => { navigate("/diffs"); onClose() }}
            title="Diffs"
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
              isDiffsActive
                ? "bg-muted border-border text-foreground"
                : "border-border/0 text-muted-foreground hover:bg-muted hover:border-border hover:text-foreground"
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            <span>Diffs</span>
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="p-[7px] pt-[5px]">
            {!hasVisibleChats && isConnecting ? (
              <div className="space-y-2 px-1 pt-3 animate-pulse">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex items-center gap-2 rounded-md px-3 py-2">
                    <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                    <div
                      className={cn(
                        "h-3.5 rounded bg-muted",
                        row === 0 ? "w-32" : row === 1 ? "w-40" : "w-28"
                      )}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {!hasVisibleChats && !isConnecting ? (
              <p className="text-sm text-slate-400 p-2 mt-6 text-center">No conversations yet</p>
            ) : null}

            <div className="space-y-[2px]">
              {data.chats.map(renderChatRow)}
            </div>

            {/* Terminals section */}
            {allTerminals.length > 0 || hasVisibleChats ? (
              <div className="mt-3">
                <div className="flex items-center justify-between px-2.5 pb-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Terminals</span>
                  <button
                    type="button"
                    onClick={handleCreateTerminal}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="New terminal"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-[2px]">
                  {allTerminals.map((terminal) => (
                    <div
                      key={terminal.id}
                      data-terminal-id={terminal.id}
                      className={cn(
                        "group/row flex items-center gap-2 rounded-lg border px-2.5 pr-1 py-1.5 transition-all cursor-pointer",
                        activeTerminalId === terminal.id
                          ? "bg-muted border-border"
                          : "border-border/0 hover:bg-muted/50 hover:border-border"
                      )}
                      onClick={() => {
                        navigate(`/terminal/${terminal.id}`)
                        onClose()
                      }}
                    >
                      <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0 truncate text-sm">{terminal.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeTerminal(terminal.projectId, terminal.id)
                          if (activeTerminalId === terminal.id) {
                            navigate("/")
                          }
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground transition-all"
                        title="Close terminal"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => {
              navigate("/settings/general")
              onClose()
            }}
            className={cn(
              "w-full rounded-xl rounded-t-md border px-3 py-2 text-left transition-colors",
              isSettingsActive
                ? "bg-muted border-border"
                : "border-border/0 hover:bg-muted hover:border-border active:bg-muted/80"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Settings</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {isConnecting ? (
                  <Loader2 className="h-2 w-2 animate-spin" />
                ) : (
                  <span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      {open ? <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} /> : null}
    </>
  )
}
