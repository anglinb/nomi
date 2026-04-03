import { useEffect, useLayoutEffect, useRef } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { AppDialogProvider } from "../components/ui/app-dialog"
import { TooltipProvider } from "../components/ui/tooltip"
import { APP_NAME, SDK_CLIENT_APP } from "../../shared/branding"
import type { SidebarData } from "../../shared/types"
import { useChatSoundPreferencesStore } from "../stores/chatSoundPreferencesStore"
import { playChatNotificationSound, shouldPlayChatSound } from "../lib/chatSounds"
import { NomiSidebar } from "./NomiSidebar"
import { ChatPage } from "./ChatPage"
import { SettingsPage } from "./SettingsPage"
import { DiffsPage } from "./DiffsPage"
import { VsCodePage } from "./VsCodePage"
import { useNomiState } from "./useNomiState"

const VERSION_SEEN_STORAGE_KEY = "nomi:last-seen-version"

export function shouldRedirectToChangelog(pathname: string, currentVersion: string, seenVersion: string | null) {
  return pathname === "/" && Boolean(currentVersion) && seenVersion !== currentVersion
}

export function getNotificationTitleCount(sidebarData: SidebarData) {
  return sidebarData.chats.reduce((count, chat) => (
    count + (chat.unread ? 1 : 0) + (chat.status === "waiting_for_user" ? 1 : 0)
  ), 0)
}

interface ChatNotificationSnapshot {
  unreadCount: number
  waitingChatIds: Set<string>
}

export function getChatNotificationSnapshot(sidebarData: SidebarData): ChatNotificationSnapshot {
  let unreadCount = 0
  const waitingChatIds = new Set<string>()

  for (const chat of sidebarData.chats) {
    if (chat.unread) unreadCount += 1
    if (chat.status === "waiting_for_user") {
      waitingChatIds.add(chat.chatId)
    }
  }

  return { unreadCount, waitingChatIds }
}

export function getChatSoundBurstCount(previous: SidebarData | null, next: SidebarData): number {
  if (!previous) return 0

  const previousSnapshot = getChatNotificationSnapshot(previous)
  const nextSnapshot = getChatNotificationSnapshot(next)

  const unreadIncrease = Math.max(0, nextSnapshot.unreadCount - previousSnapshot.unreadCount)
  let newWaitingChats = 0
  for (const chatId of nextSnapshot.waitingChatIds) {
    if (!previousSnapshot.waitingChatIds.has(chatId)) {
      newWaitingChats += 1
    }
  }

  return unreadIncrease + newWaitingChats
}

function NomiLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const state = useNomiState(params.chatId ?? null)
  const chatSoundPreference = useChatSoundPreferencesStore((store) => store.chatSoundPreference)
  const chatSoundId = useChatSoundPreferencesStore((store) => store.chatSoundId)
  const currentVersion = SDK_CLIENT_APP.split("/")[1] ?? "unknown"
  const previousSidebarDataRef = useRef<SidebarData | null>(null)

  useEffect(() => {
    const seenVersion = window.localStorage.getItem(VERSION_SEEN_STORAGE_KEY)
    const shouldRedirect = shouldRedirectToChangelog(location.pathname, currentVersion, seenVersion)
    window.localStorage.setItem(VERSION_SEEN_STORAGE_KEY, currentVersion)
    if (!shouldRedirect) return
    navigate("/settings/changelog", { replace: true })
  }, [currentVersion, location.pathname, navigate])

  useLayoutEffect(() => {
    document.title = APP_NAME
  }, [location.key])

  useEffect(() => {
    function handlePageShow() {
      document.title = APP_NAME
    }

    function handlePageHide() {
      document.title = APP_NAME
    }

    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [])

  useEffect(() => {
    const notificationCount = getNotificationTitleCount(state.sidebarData)
    document.title = notificationCount > 0 ? `[${notificationCount}] ${APP_NAME}` : APP_NAME
  }, [state.sidebarData])

  useEffect(() => {
    const burstCount = getChatSoundBurstCount(previousSidebarDataRef.current, state.sidebarData)
    previousSidebarDataRef.current = state.sidebarData

    if (burstCount <= 0) return
    if (!shouldPlayChatSound(chatSoundPreference)) return

    void playChatNotificationSound(chatSoundId, burstCount).catch(() => undefined)
  }, [chatSoundId, chatSoundPreference, state.sidebarData])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      <NomiSidebar
        data={state.sidebarData}
        activeChatId={state.activeChatId}
        connectionStatus={state.connectionStatus}
        ready={state.sidebarReady}
        open={state.sidebarOpen}
        collapsed={state.sidebarCollapsed}
        onOpen={state.openSidebar}
        onClose={state.closeSidebar}
        onCollapse={state.collapseSidebar}
        onExpand={state.expandSidebar}
        onCreateChat={() => {
          void state.handleCreateChat()
        }}
        onDeleteChat={(chat) => {
          void state.handleDeleteChat(chat)
        }}
        updateSnapshot={state.updateSnapshot}
        onInstallUpdate={() => {
          void state.handleInstallUpdate()
        }}
      />
      <Outlet context={state} />
    </div>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <AppDialogProvider>
        <Routes>
          <Route element={<NomiLayout />}>
            <Route path="/" element={<ChatPage />} />
            <Route path="/vscode" element={<VsCodePage />} />
            <Route path="/diffs" element={<DiffsPage />} />
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:sectionId" element={<SettingsPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Route>
        </Routes>
      </AppDialogProvider>
    </TooltipProvider>
  )
}
