import type {
  ChatRuntime,
  ChatSnapshot,
  NomiStatus,
  SidebarChatRow,
  SidebarData,
} from "../shared/types"
import type { ChatRecord, StoreState } from "./events"
import { DEFAULT_PROJECT_ID } from "./event-store"
import { SERVER_PROVIDERS } from "./provider-catalog"

export function deriveStatus(chat: ChatRecord, activeStatus?: NomiStatus): NomiStatus {
  if (activeStatus) return activeStatus
  if (chat.lastTurnOutcome === "failed") return "failed"
  return "idle"
}

export function deriveSidebarData(
  state: StoreState,
  activeStatuses: Map<string, NomiStatus>
): SidebarData {
  const chats: SidebarChatRow[] = [...state.chatsById.values()]
    .filter((chat) => !chat.deletedAt)
    .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
    .map((chat) => {
      const project = state.projectsById.get(chat.projectId)
      return {
        _id: chat.id,
        _creationTime: chat.createdAt,
        chatId: chat.id,
        title: chat.title,
        status: deriveStatus(chat, activeStatuses.get(chat.id)),
        unread: chat.unread,
        localPath: project?.localPath ?? "",
        provider: chat.provider,
        lastMessageAt: chat.lastMessageAt,
        hasAutomation: false,
      }
    })

  return { chats }
}

export function deriveChatSnapshot(
  state: StoreState,
  activeStatuses: Map<string, NomiStatus>,
  drainingChatIds: Set<string>,
  chatId: string,
  getMessages: (chatId: string) => ChatSnapshot["messages"]
): ChatSnapshot | null {
  const chat = state.chatsById.get(chatId)
  if (!chat || chat.deletedAt) return null
  const project = state.projectsById.get(chat.projectId)
    ?? state.projectsById.get(DEFAULT_PROJECT_ID)
  if (!project || project.deletedAt) return null

  const runtime: ChatRuntime = {
    chatId: chat.id,
    projectId: project.id,
    localPath: project.localPath,
    title: chat.title,
    status: deriveStatus(chat, activeStatuses.get(chat.id)),
    isDraining: drainingChatIds.has(chat.id),
    provider: chat.provider,
    planMode: chat.planMode,
    sessionToken: chat.sessionToken,
  }

  return {
    runtime,
    messages: getMessages(chat.id),
    availableProviders: [...SERVER_PROVIDERS],
  }
}
