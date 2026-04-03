import { describe, expect, test } from "bun:test"
import {
  getActiveChatSnapshot,
  getNewestRemainingChatId,
  getUiUpdateRestartReconnectAction,
  shouldMarkActiveChatRead,
  shouldAutoFollowTranscript,
} from "./useNomiState"
import type { ChatSnapshot, SidebarChatRow } from "../../shared/types"

function createChatRows(): SidebarChatRow[] {
  return [
    {
      _id: "row-1",
      _creationTime: 3,
      chatId: "chat-3",
      title: "Newest",
      status: "idle",
      unread: false,
      localPath: "/tmp/project-1",
      provider: null,
      lastMessageAt: 3,
      hasAutomation: false,
    },
    {
      _id: "row-2",
      _creationTime: 2,
      chatId: "chat-2",
      title: "Older",
      status: "idle",
      unread: false,
      localPath: "/tmp/project-1",
      provider: null,
      lastMessageAt: 2,
      hasAutomation: false,
    },
    {
      _id: "row-3",
      _creationTime: 1,
      chatId: "chat-1",
      title: "Oldest",
      status: "idle",
      unread: false,
      localPath: "/tmp/project-1",
      provider: null,
      lastMessageAt: 1,
      hasAutomation: false,
    },
  ]
}

describe("getNewestRemainingChatId", () => {
  test("returns the next chat after the active one", () => {
    const chats = createChatRows()
    expect(getNewestRemainingChatId(chats, "chat-3")).toBe("chat-2")
  })

  test("returns null when no other chats remain", () => {
    const chats = createChatRows().slice(0, 1)
    expect(getNewestRemainingChatId(chats, "chat-3")).toBeNull()
  })

  test("returns null when the chat is not found", () => {
    const chats = createChatRows()
    expect(getNewestRemainingChatId(chats, "missing")).toBe("chat-3")
  })
})

describe("shouldAutoFollowTranscript", () => {
  test("returns true when the transcript is at the bottom", () => {
    expect(shouldAutoFollowTranscript(0)).toBe(true)
  })

  test("returns true when the transcript is near the bottom", () => {
    expect(shouldAutoFollowTranscript(23)).toBe(true)
  })

  test("returns false when the transcript is not near the bottom", () => {
    expect(shouldAutoFollowTranscript(24)).toBe(false)
  })
})

describe("shouldMarkActiveChatRead", () => {
  test("returns true only when the page is visible and focused", () => {
    expect(shouldMarkActiveChatRead({
      visibilityState: "visible",
      hasFocus: () => true,
    })).toBe(true)

    expect(shouldMarkActiveChatRead({
      visibilityState: "hidden",
      hasFocus: () => true,
    })).toBe(false)

    expect(shouldMarkActiveChatRead({
      visibilityState: "visible",
      hasFocus: () => false,
    })).toBe(false)
  })
})

describe("getUiUpdateRestartReconnectAction", () => {
  test("waits for reconnect after the socket disconnects", () => {
    expect(getUiUpdateRestartReconnectAction("awaiting_disconnect", "disconnected")).toBe("awaiting_reconnect")
  })

  test("navigates to changelog after reconnect", () => {
    expect(getUiUpdateRestartReconnectAction("awaiting_reconnect", "connected")).toBe("navigate_changelog")
  })

  test("does nothing for unrelated phase and connection combinations", () => {
    expect(getUiUpdateRestartReconnectAction(null, "connected")).toBe("none")
    expect(getUiUpdateRestartReconnectAction("awaiting_disconnect", "connected")).toBe("none")
    expect(getUiUpdateRestartReconnectAction("awaiting_reconnect", "disconnected")).toBe("none")
  })
})

describe("getActiveChatSnapshot", () => {
  test("returns the snapshot when it matches the active chat id", () => {
    const snapshot: ChatSnapshot = {
      runtime: {
        chatId: "chat-1",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Chat 1",
        status: "idle",
        isDraining: false,
        provider: "codex",
        planMode: false,
        sessionToken: null,
      },
      messages: [],
      availableProviders: [],
    }

    expect(getActiveChatSnapshot(snapshot, "chat-1")).toEqual(snapshot)
  })

  test("returns null for a stale snapshot from a previous route", () => {
    const snapshot: ChatSnapshot = {
      runtime: {
        chatId: "chat-old",
        projectId: "project-1",
        localPath: "/tmp/project-1",
        title: "Old chat",
        status: "idle",
        isDraining: false,
        provider: "claude",
        planMode: false,
        sessionToken: null,
      },
      messages: [],
      availableProviders: [],
    }

    expect(getActiveChatSnapshot(snapshot, "chat-new")).toBeNull()
  })
})
