import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "react-router-dom"
import { PROVIDERS, type AgentProvider, type AskUserQuestionAnswerMap, type KeybindingsSnapshot, type ModelOptions, type ProviderCatalogEntry, type UpdateInstallResult, type UpdateSnapshot } from "../../shared/types"
import { NEW_CHAT_COMPOSER_ID, type ComposerState, useChatPreferencesStore } from "../stores/chatPreferencesStore"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import type { ChatSnapshot, SidebarChatRow, SidebarData } from "../../shared/types"
import type { AskUserQuestionItem } from "../components/messages/types"
import { useAppDialog } from "../components/ui/app-dialog"
import { processTranscriptMessages } from "../lib/parseTranscript"
import { canCancelStatus, getLatestToolIds, isProcessingStatus } from "./derived"
import { NomiSocket, type SocketStatus } from "./socket"

export function getNewestRemainingChatId(chats: SidebarChatRow[], activeChatId: string): string | null {
  return chats.find((chat) => chat.chatId !== activeChatId)?.chatId ?? null
}

export function shouldMarkActiveChatRead(doc: Pick<Document, "visibilityState" | "hasFocus"> = document) {
  return doc.visibilityState === "visible" && doc.hasFocus()
}

function wsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws`
}

function useNomiSocket() {
  const socketRef = useRef<NomiSocket | null>(null)
  if (!socketRef.current) {
    socketRef.current = new NomiSocket(wsUrl())
  }

  useEffect(() => {
    const socket = socketRef.current
    socket?.start()
    return () => {
      socket?.dispose()
    }
  }, [])

  return socketRef.current as NomiSocket
}

function logNomiState(message: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[useNomiState] ${message}`)
    return
  }

  console.info(`[useNomiState] ${message}`, details)
}

function composerStateFromSendOptions(options?: {
  provider?: AgentProvider
  model?: string
  modelOptions?: ModelOptions
  planMode?: boolean
}): ComposerState | null {
  if (options?.provider === "claude" && options.model && options.modelOptions?.claude) {
    return {
      provider: "claude",
      model: options.model,
      modelOptions: {
        reasoningEffort: options.modelOptions.claude.reasoningEffort ?? "high",
        contextWindow: options.modelOptions.claude.contextWindow ?? "200k",
      },
      planMode: Boolean(options.planMode),
    }
  }

  if (options?.provider === "codex" && options.model && options.modelOptions?.codex) {
    return {
      provider: "codex",
      model: options.model,
      modelOptions: {
        reasoningEffort: options.modelOptions.codex.reasoningEffort ?? "high",
        fastMode: options.modelOptions.codex.fastMode ?? false,
      },
      planMode: Boolean(options.planMode),
    }
  }

  return null
}

export function shouldAutoFollowTranscript(distanceFromBottom: number) {
  return distanceFromBottom < 24
}

export function getUiUpdateRestartReconnectAction(
  phase: string | null,
  connectionStatus: SocketStatus
): "none" | "awaiting_reconnect" | "navigate_changelog" {
  if (phase === "awaiting_disconnect" && connectionStatus === "disconnected") {
    return "awaiting_reconnect"
  }

  if (phase === "awaiting_reconnect" && connectionStatus === "connected") {
    return "navigate_changelog"
  }

  return "none"
}

const FIXED_TRANSCRIPT_PADDING_BOTTOM = 320
const UI_UPDATE_RESTART_STORAGE_KEY = "nomi:ui-update-restart"

function getUiUpdateRestartPhase() {
  return window.sessionStorage.getItem(UI_UPDATE_RESTART_STORAGE_KEY)
}

function setUiUpdateRestartPhase(phase: "awaiting_disconnect" | "awaiting_reconnect") {
  window.sessionStorage.setItem(UI_UPDATE_RESTART_STORAGE_KEY, phase)
}

function clearUiUpdateRestartPhase() {
  window.sessionStorage.removeItem(UI_UPDATE_RESTART_STORAGE_KEY)
}

export function getActiveChatSnapshot(chatSnapshot: ChatSnapshot | null, activeChatId: string | null): ChatSnapshot | null {
  if (!chatSnapshot) return null
  if (!activeChatId) return null
  if (chatSnapshot.runtime.chatId !== activeChatId) {
    logNomiState("stale snapshot masked", {
      routeChatId: activeChatId,
      snapshotChatId: chatSnapshot.runtime.chatId,
      snapshotProvider: chatSnapshot.runtime.provider,
    })
    return null
  }
  return chatSnapshot
}

export interface NomiState {
  socket: NomiSocket
  activeChatId: string | null
  sidebarData: SidebarData
  updateSnapshot: UpdateSnapshot | null
  chatSnapshot: ChatSnapshot | null
  keybindings: KeybindingsSnapshot | null
  connectionStatus: SocketStatus
  sidebarReady: boolean
  commandError: string | null
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  messages: ReturnType<typeof processTranscriptMessages>
  latestToolIds: ReturnType<typeof getLatestToolIds>
  runtime: ChatSnapshot["runtime"] | null
  availableProviders: ProviderCatalogEntry[]
  isProcessing: boolean
  canCancel: boolean
  isDraining: boolean
  transcriptPaddingBottom: number
  showScrollButton: boolean
  navbarLocalPath?: string
  openSidebar: () => void
  closeSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  updateScrollState: () => void
  scrollToBottom: () => void
  handleCreateChat: () => Promise<void>
  handleCheckForUpdates: (options?: { force?: boolean }) => Promise<void>
  handleInstallUpdate: () => Promise<void>
  handleSend: (content: string, options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }) => Promise<void>
  handleCancel: () => Promise<void>
  handleStopDraining: () => Promise<void>
  handleDeleteChat: (chat: SidebarChatRow) => Promise<void>
  handleOpenLocalLink: (target: { path: string; line?: number; column?: number }) => Promise<void>
  handleCompose: () => void
  handleAskUserQuestion: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => Promise<void>
  handleExitPlanMode: (
    toolUseId: string,
    confirmed: boolean,
    clearContext?: boolean,
    message?: string
  ) => Promise<void>
}

export function useNomiState(activeChatId: string | null): NomiState {
  const navigate = useNavigate()
  const socket = useNomiSocket()
  const dialog = useAppDialog()

  const [sidebarData, setSidebarData] = useState<SidebarData>({ chats: [] })
  const [updateSnapshot, setUpdateSnapshot] = useState<UpdateSnapshot | null>(null)
  const [chatSnapshot, setChatSnapshot] = useState<ChatSnapshot | null>(null)
  const [keybindings, setKeybindings] = useState<KeybindingsSnapshot | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<SocketStatus>("connecting")
  const [sidebarReady, setSidebarReady] = useState(false)
  const [chatReady, setChatReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputHeight, setInputHeight] = useState(148)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [pendingChatId, setPendingChatId] = useState<string | null>(null)
  const [focusEpoch, setFocusEpoch] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const initialScrollCompletedRef = useRef(false)
  const initialScrollFrameRef = useRef<number | null>(null)
  const autoCreatedChatRef = useRef(false)

  useEffect(() => socket.onStatus(setConnectionStatus), [socket])

  useEffect(() => {
    return socket.subscribe<SidebarData>({ type: "sidebar" }, (snapshot) => {
      setSidebarData(snapshot)
      setSidebarReady(true)
      setCommandError(null)
    })
  }, [socket])

  // Auto-create a first chat when there are none
  useEffect(() => {
    if (!sidebarReady || activeChatId || autoCreatedChatRef.current) return
    if (sidebarData.chats.length > 0) return
    autoCreatedChatRef.current = true

    void (async () => {
      try {
        const result = await socket.command<{ chatId: string }>({ type: "chat.create" })
        setPendingChatId(result.chatId)
        navigate(`/chat/${result.chatId}`, { replace: true })
      } catch {
        // Silently ignore — user can still create manually
      }
    })()
  }, [sidebarReady, sidebarData.chats.length, activeChatId, socket, navigate])

  useEffect(() => {
    return socket.subscribe<UpdateSnapshot>({ type: "update" }, (snapshot) => {
      setUpdateSnapshot(snapshot)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    if (connectionStatus !== "connected") return
    void socket.command<UpdateSnapshot>({ type: "update.check", force: true }).catch((error) => {
      setCommandError(error instanceof Error ? error.message : String(error))
    })
  }, [connectionStatus, socket])

  useEffect(() => {
    const phase = getUiUpdateRestartPhase()
    const reconnectAction = getUiUpdateRestartReconnectAction(phase, connectionStatus)
    if (reconnectAction === "awaiting_reconnect") {
      setUiUpdateRestartPhase("awaiting_reconnect")
      return
    }

    if (reconnectAction === "navigate_changelog") {
      clearUiUpdateRestartPhase()
      navigate("/settings/changelog", { replace: true })
    }
  }, [connectionStatus, navigate])

  useEffect(() => {
    function handleWindowFocus() {
      if (!updateSnapshot?.lastCheckedAt) return
      if (Date.now() - updateSnapshot.lastCheckedAt <= 60 * 60 * 1000) return
      void socket.command<UpdateSnapshot>({ type: "update.check" }).catch((error) => {
        setCommandError(error instanceof Error ? error.message : String(error))
      })
    }

    window.addEventListener("focus", handleWindowFocus)
    return () => {
      window.removeEventListener("focus", handleWindowFocus)
    }
  }, [socket, updateSnapshot?.lastCheckedAt])

  useEffect(() => {
    return socket.subscribe<KeybindingsSnapshot>({ type: "keybindings" }, (snapshot) => {
      setKeybindings(snapshot)
      setCommandError(null)
    })
  }, [socket])

  useEffect(() => {
    function handleFocusSignal() {
      setFocusEpoch((value) => value + 1)
    }

    window.addEventListener("focus", handleFocusSignal)
    document.addEventListener("visibilitychange", handleFocusSignal)

    return () => {
      window.removeEventListener("focus", handleFocusSignal)
      document.removeEventListener("visibilitychange", handleFocusSignal)
    }
  }, [])

  useEffect(() => {
    if (!activeChatId) {
      logNomiState("clearing chat snapshot for non-chat route")
      setChatSnapshot(null)
      setChatReady(true)
      return
    }

    logNomiState("subscribing to chat", { activeChatId })
    setChatSnapshot(null)
    setChatReady(false)
    return socket.subscribe<ChatSnapshot | null>({ type: "chat", chatId: activeChatId }, (snapshot) => {
      logNomiState("chat snapshot received", {
        activeChatId,
        snapshotChatId: snapshot?.runtime.chatId ?? null,
        snapshotProvider: snapshot?.runtime.provider ?? null,
        snapshotStatus: snapshot?.runtime.status ?? null,
      })
      setChatSnapshot(snapshot)
      setChatReady(true)
      setCommandError(null)
    })
  }, [activeChatId, socket])

  useEffect(() => {
    if (!activeChatId) return
    if (!sidebarReady || !chatReady) return
    const exists = sidebarData.chats.some((chat) => chat.chatId === activeChatId)
    if (exists) {
      if (pendingChatId === activeChatId) {
        setPendingChatId(null)
      }
      return
    }
    if (pendingChatId === activeChatId) {
      return
    }
    navigate("/")
  }, [activeChatId, chatReady, navigate, pendingChatId, sidebarData.chats, sidebarReady])

  useEffect(() => {
    if (!chatSnapshot) return
    if (pendingChatId === chatSnapshot.runtime.chatId) {
      setPendingChatId(null)
    }
  }, [chatSnapshot, pendingChatId])

  useEffect(() => {
    if (!activeChatId || !sidebarReady) return
    if (!shouldMarkActiveChatRead()) return
    const activeSidebarChat = sidebarData.chats.find((chat) => chat.chatId === activeChatId)
    if (!activeSidebarChat?.unread) return
    void socket.command({ type: "chat.markRead", chatId: activeChatId }).catch((error) => {
      setCommandError(error instanceof Error ? error.message : String(error))
    })
  }, [activeChatId, focusEpoch, sidebarData.chats, sidebarReady, socket])

  useEffect(() => {
    initialScrollCompletedRef.current = false
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
      initialScrollFrameRef.current = null
    }
    setIsAtBottom(true)
  }, [activeChatId])

  useEffect(() => {
    return () => {
      if (initialScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(initialScrollFrameRef.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const element = inputRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setInputHeight(element.getBoundingClientRect().height)
    })
    observer.observe(element)
    setInputHeight(element.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [])

  const activeChatSnapshot = useMemo(
    () => getActiveChatSnapshot(chatSnapshot, activeChatId),
    [activeChatId, chatSnapshot]
  )
  useEffect(() => {
    logNomiState("active snapshot resolved", {
      routeChatId: activeChatId,
      rawSnapshotChatId: chatSnapshot?.runtime.chatId ?? null,
      rawSnapshotProvider: chatSnapshot?.runtime.provider ?? null,
      activeSnapshotChatId: activeChatSnapshot?.runtime.chatId ?? null,
      activeSnapshotProvider: activeChatSnapshot?.runtime.provider ?? null,
      pendingChatId,
    })
  }, [activeChatId, activeChatSnapshot, chatSnapshot, pendingChatId])
  const messages = useMemo(() => processTranscriptMessages(activeChatSnapshot?.messages ?? []), [activeChatSnapshot?.messages])
  const latestToolIds = useMemo(() => getLatestToolIds(messages), [messages])
  const runtime = activeChatSnapshot?.runtime ?? null
  const availableProviders = activeChatSnapshot?.availableProviders ?? PROVIDERS
  const isProcessing = isProcessingStatus(runtime?.status)
  const canCancel = canCancelStatus(runtime?.status)
  const isDraining = runtime?.isDraining ?? false
  const transcriptPaddingBottom = FIXED_TRANSCRIPT_PADDING_BOTTOM
  const showScrollButton = !isAtBottom && messages.length > 0
  const navbarLocalPath = runtime?.localPath

  useLayoutEffect(() => {
    if (initialScrollCompletedRef.current) return

    const element = scrollRef.current
    if (!element) return
    if (activeChatId && !runtime) return

    element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    if (initialScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(initialScrollFrameRef.current)
    }
    initialScrollFrameRef.current = window.requestAnimationFrame(() => {
      const currentElement = scrollRef.current
      if (!currentElement) return
      currentElement.scrollTo({ top: currentElement.scrollHeight, behavior: "auto" })
      initialScrollFrameRef.current = null
    })
    initialScrollCompletedRef.current = true
  }, [activeChatId, inputHeight, messages.length, runtime])

  useEffect(() => {
    if (!initialScrollCompletedRef.current || !isAtBottom) return

    const frameId = window.requestAnimationFrame(() => {
      const element = scrollRef.current
      if (!element || !isAtBottom) return
      element.scrollTo({ top: element.scrollHeight, behavior: "auto" })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeChatId, inputHeight, isAtBottom, messages.length, runtime?.status])

  function updateScrollState() {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setIsAtBottom(shouldAutoFollowTranscript(distance))
  }

  function enableAutoFollow(behavior: ScrollBehavior) {
    const element = scrollRef.current
    setIsAtBottom(true)
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior })
  }

  function scrollToBottom() {
    enableAutoFollow("smooth")
  }

  async function handleCreateChat() {
    try {
      const chatPreferences = useChatPreferencesStore.getState()
      const sourceComposerState = activeChatId
        ? chatPreferences.getComposerState(activeChatId)
        : chatPreferences.getComposerState(NEW_CHAT_COMPOSER_ID)
      const result = await socket.command<{ chatId: string }>({ type: "chat.create" })
      chatPreferences.initializeComposerForChat(result.chatId, { sourceState: sourceComposerState })
      setPendingChatId(result.chatId)
      navigate(`/chat/${result.chatId}`)
      setSidebarOpen(false)
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleCheckForUpdates(options?: { force?: boolean }) {
    try {
      await socket.command<UpdateSnapshot>({ type: "update.check", force: options?.force })
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleInstallUpdate() {
    try {
      const result = await socket.command<UpdateInstallResult>({ type: "update.install" })
      if (!result.ok) {
        clearUiUpdateRestartPhase()
        setCommandError(null)
        await dialog.alert({
          title: result.userTitle ?? "Update failed",
          description: result.userMessage ?? "Nomi could not install the update. Try again later.",
          closeLabel: "OK",
        })
        return
      }

      if (result.ok && result.action === "reload") {
        window.location.reload()
        return
      }

      if (result.ok && result.action === "restart") {
        setUiUpdateRestartPhase("awaiting_disconnect")
      }
      setCommandError(null)
    } catch (error) {
      clearUiUpdateRestartPhase()
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSend(
    content: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean; attachments?: import("../../shared/types").ChatAttachment[] }
  ) {
    try {
      enableAutoFollow("auto")

      const result = await socket.command<{ chatId?: string }>({
        type: "chat.send",
        chatId: activeChatId ?? undefined,
        content,
        attachments: options?.attachments,
        provider: options?.provider,
        model: options?.model,
        modelOptions: options?.modelOptions,
        planMode: options?.planMode,
      })

      if (!activeChatId && result.chatId) {
        const chatPreferences = useChatPreferencesStore.getState()
        chatPreferences.setComposerState(
          result.chatId,
          composerStateFromSendOptions(options) ?? chatPreferences.getComposerState(NEW_CHAT_COMPOSER_ID)
        )
        setPendingChatId(result.chatId)
        navigate(`/chat/${result.chatId}`)
      }
      setCommandError(null)
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function handleCancel() {
    if (!activeChatId) return
    try {
      await socket.command({ type: "chat.cancel", chatId: activeChatId })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleStopDraining() {
    if (!activeChatId) return
    try {
      await socket.command({ type: "chat.stopDraining", chatId: activeChatId })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleDeleteChat(chat: SidebarChatRow) {
    const confirmed = await dialog.confirm({
      title: "Delete Chat",
      description: `Delete "${chat.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    try {
      await socket.command({ type: "chat.delete", chatId: chat.chatId })
      if (chat.chatId === activeChatId) {
        const nextChatId = getNewestRemainingChatId(sidebarData.chats, chat.chatId)
        navigate(nextChatId ? `/chat/${nextChatId}` : "/")
      }
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleOpenLocalLink(target: { path: string; line?: number; column?: number }) {
    try {
      await openExternal({
        action: "open_editor",
        localPath: target.path,
        line: target.line,
        column: target.column,
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function openExternal(command: {
    action: "open_finder" | "open_terminal" | "open_editor"
    localPath: string
    line?: number
    column?: number
  }) {
    const preferences = useTerminalPreferencesStore.getState()
    setCommandError(null)
    await socket.command({
      type: "system.openExternal",
      ...command,
      editor: command.action === "open_editor"
        ? {
            preset: preferences.editorPreset,
            commandTemplate: preferences.editorCommandTemplate,
          }
        : undefined,
    })
  }

  function handleCompose() {
    void handleCreateChat()
  }

  async function handleAskUserQuestion(
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) {
    if (!activeChatId) return
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: { questions, answers },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleExitPlanMode(toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) {
    if (!activeChatId) return
    if (confirmed) {
      useChatPreferencesStore.getState().setChatComposerPlanMode(activeChatId, false)
    }
    try {
      await socket.command({
        type: "chat.respondTool",
        chatId: activeChatId,
        toolUseId,
        result: {
          confirmed,
          ...(clearContext ? { clearContext: true } : {}),
          ...(message ? { message } : {}),
        },
      })
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    socket,
    activeChatId,
    sidebarData,
    updateSnapshot,
    chatSnapshot,
    keybindings,
    connectionStatus,
    sidebarReady,
    commandError,
    sidebarOpen,
    sidebarCollapsed,
    scrollRef,
    inputRef,
    messages,
    latestToolIds,
    runtime,
    availableProviders,
    isProcessing,
    canCancel,
    isDraining,
    transcriptPaddingBottom,
    showScrollButton,
    navbarLocalPath,
    openSidebar: () => setSidebarOpen(true),
    closeSidebar: () => setSidebarOpen(false),
    collapseSidebar: () => setSidebarCollapsed(true),
    expandSidebar: () => setSidebarCollapsed(false),
    updateScrollState,
    scrollToBottom,
    handleCreateChat,
    handleCheckForUpdates,
    handleInstallUpdate,
    handleSend,
    handleCancel,
    handleStopDraining,
    handleDeleteChat,
    handleOpenLocalLink,
    handleCompose,
    handleAskUserQuestion,
    handleExitPlanMode,
  }
}
