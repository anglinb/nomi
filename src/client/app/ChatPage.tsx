import { useEffect, useRef, useState } from "react"
import { ArrowDown, Upload } from "lucide-react"
import { NomiIcon } from "../components/ui/nomi-icon"
import { useOutletContext } from "react-router-dom"
import type { HydratedTranscriptMessage } from "../../shared/types"
import { ChatInput, type ChatInputHandle } from "../components/chat-ui/ChatInput"
import { ChatNavbar } from "../components/chat-ui/ChatNavbar"
import { DrainingIndicator } from "../components/messages/DrainingIndicator"
import { ProcessingMessage } from "../components/messages/ProcessingMessage"
import { Card, CardContent } from "../components/ui/card"
import { ScrollArea } from "../components/ui/scroll-area"
import { cn } from "../lib/utils"
import type { NomiState } from "./useNomiState"
import { NomiTranscript } from "./NomiTranscript"
import { useStickyChatFocus } from "./useStickyChatFocus"

const EMPTY_STATE_TEXT = "What are we building?"
const EMPTY_STATE_TYPING_INTERVAL_MS = 19
const CHAT_NAVBAR_OFFSET_PX = 72
const SCROLL_BUTTON_BOTTOM_PX = 120
const TRANSCRIPT_TOC_BREAKPOINT_PX = 1200

export interface TranscriptTocItem {
  id: string
  label: string
  order: number
}

export function getTranscriptTocLabel(content: string) {
  const firstLine = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return firstLine ?? "(attachment only)"
}

export function createTranscriptTocItems(messages: HydratedTranscriptMessage[]): TranscriptTocItem[] {
  let order = 0

  return messages.flatMap((message) => {
    if (message.kind !== "user_prompt" || message.hidden) {
      return []
    }

    order += 1
    return [{
      id: message.id,
      label: getTranscriptTocLabel(message.content),
      order,
    }]
  })
}

export function shouldShowTranscriptTocPanel(args: {
  enabled: boolean
  layoutWidth: number
  itemCount: number
}) {
  return args.enabled && args.layoutWidth > TRANSCRIPT_TOC_BREAKPOINT_PX && args.itemCount > 0
}

export function scrollTranscriptMessageIntoView(
  container: Pick<HTMLElement, "getBoundingClientRect" | "scrollTop" | "scrollTo">,
  target: Pick<HTMLElement, "getBoundingClientRect">
) {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const top = container.scrollTop + targetRect.top - containerRect.top - CHAT_NAVBAR_OFFSET_PX

  container.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  })
}

export function hasFileDragTypes(types: Iterable<string>) {
  return Array.from(types).includes("Files")
}

export function ChatPage() {
  const state = useOutletContext<NomiState>()
  const chatCardRef = useRef<HTMLDivElement>(null)
  const chatInputElementRef = useRef<HTMLTextAreaElement>(null)
  const chatInputRef = useRef<ChatInputHandle | null>(null)
  const [typedEmptyStateText, setTypedEmptyStateText] = useState("")
  const [isEmptyStateTypingComplete, setIsEmptyStateTypingComplete] = useState(false)
  const [isPageFileDragActive, setIsPageFileDragActive] = useState(false)
  const pageFileDragDepthRef = useRef(0)
  const layoutRootRef = useRef<HTMLDivElement>(null)
  const projectId = state.runtime?.projectId ?? null

  useStickyChatFocus({
    rootRef: chatCardRef,
    fallbackRef: chatInputElementRef,
    enabled: true && state.runtime?.status !== "waiting_for_user",
    canCancel: state.canCancel,
  })

  function hasDraggedFiles(event: React.DragEvent) {
    return hasFileDragTypes(event.dataTransfer?.types ?? [])
  }

  function enqueueDroppedFiles(files: File[]) {
    if (!true || files.length === 0) {
      return
    }
    chatInputRef.current?.enqueueFiles(files)
  }

  useEffect(() => {
    if (state.messages.length !== 0) return

    setTypedEmptyStateText("")
    setIsEmptyStateTypingComplete(false)

    let characterIndex = 0
    const interval = window.setInterval(() => {
      characterIndex += 1
      setTypedEmptyStateText(EMPTY_STATE_TEXT.slice(0, characterIndex))

      if (characterIndex >= EMPTY_STATE_TEXT.length) {
        window.clearInterval(interval)
        setIsEmptyStateTypingComplete(true)
      }
    }, EMPTY_STATE_TYPING_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [state.activeChatId, state.messages.length])

  return (
    <div ref={layoutRootRef} className="flex-1 flex flex-col min-w-0 relative">
      <Card
        ref={chatCardRef}
        className="bg-background h-full flex flex-col overflow-hidden border-0 rounded-none relative"
        onDragEnter={(event) => {
          if (!hasDraggedFiles(event) || !true) return
          event.preventDefault()
          pageFileDragDepthRef.current += 1
          setIsPageFileDragActive(true)
        }}
        onDragOver={(event) => {
          if (!hasDraggedFiles(event) || !true) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
          if (!isPageFileDragActive) {
            setIsPageFileDragActive(true)
          }
        }}
        onDragLeave={(event) => {
          if (!hasDraggedFiles(event) || !true) return
          event.preventDefault()
          pageFileDragDepthRef.current = Math.max(0, pageFileDragDepthRef.current - 1)
          if (pageFileDragDepthRef.current === 0) {
            setIsPageFileDragActive(false)
          }
        }}
        onDrop={(event) => {
          if (!hasDraggedFiles(event) || !true) return
          event.preventDefault()
          pageFileDragDepthRef.current = 0
          setIsPageFileDragActive(false)
          enqueueDroppedFiles([...event.dataTransfer.files])
        }}
      >
        <CardContent className="flex flex-1 min-h-0 flex-col p-0 overflow-hidden relative">
          <ChatNavbar
            sidebarCollapsed={state.sidebarCollapsed}
            onOpenSidebar={state.openSidebar}
            onExpandSidebar={state.expandSidebar}
            onNewChat={state.handleCompose}
            localPath={state.navbarLocalPath}
          />

          <ScrollArea
            ref={state.scrollRef}
            onScroll={state.updateScrollState}
            className="flex-1 min-h-0 px-4 scroll-pt-[72px]"
          >
            {state.messages.length === 0 ? <div style={{ height: state.transcriptPaddingBottom }} aria-hidden="true" /> : null}
            {state.messages.length > 0 ? (
              <>
                <div className="animate-fade-in space-y-5 pt-[72px] max-w-[800px] mx-auto">
                  <NomiTranscript
                    messages={state.messages}
                    isLoading={state.isProcessing}
                    localPath={state.runtime?.localPath}
                    latestToolIds={state.latestToolIds}
                    onOpenLocalLink={state.handleOpenLocalLink}
                    onAskUserQuestionSubmit={state.handleAskUserQuestion}
                    onExitPlanModeConfirm={state.handleExitPlanMode}
                    onSetApiKey={async (apiKey) => {
                      await state.socket.command({ type: "auth.setApiKey", apiKey })
                    }}
                    onStartLogin={async () => {
                      return await state.socket.command<{ oauthUrl: string }>({ type: "auth.startLogin" })
                    }}
                    onSubmitOAuthCode={async (code) => {
                      return await state.socket.command<{ success: boolean }>({ type: "auth.submitOAuthCode", code })
                    }}
                    onCheckAuthStatus={async () => {
                      return await state.socket.command<{ loggedIn: boolean; email?: string }>({ type: "auth.status" })
                    }}
                  />
                  {state.isProcessing ? <ProcessingMessage status={state.runtime?.status} /> : null}
                  {!state.isProcessing && state.isDraining ? (
                    <DrainingIndicator onStop={() => void state.handleStopDraining()} />
                  ) : null}
                </div>
                <div style={{ height: state.transcriptPaddingBottom }} aria-hidden="true" />
              </>
            ) : null}

            {state.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-end h-full pb-4">
                <NomiIcon className="h-8 w-8 text-muted-foreground/30 mb-4" />
                <span className={cn(
                  "text-muted-foreground/40 text-lg transition-opacity duration-200",
                  isEmptyStateTypingComplete ? "opacity-100" : "opacity-70"
                )}>
                  {typedEmptyStateText}
                  {!isEmptyStateTypingComplete && <span className="animate-pulse">|</span>}
                </span>
              </div>
            ) : null}
          </ScrollArea>

          {state.showScrollButton ? (
            <div className="absolute z-20 left-1/2 -translate-x-1/2 animate-fade-in" style={{ bottom: `${SCROLL_BUTTON_BOTTOM_PX}px` }}>
              <button
                type="button"
                onClick={() => state.scrollToBottom()}
                className={cn(
                  "flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-md",
                  "hover:bg-accent hover:text-foreground transition-colors"
                )}
              >
                <ArrowDown className="h-3 w-3" />
                Scroll to bottom
              </button>
            </div>
          ) : null}

          {isPageFileDragActive ? (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <span className="text-sm font-medium">Drop files to attach</span>
              </div>
            </div>
          ) : null}
        </CardContent>

        <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
          <div className="bg-gradient-to-t from-background via-background pointer-events-auto" ref={state.inputRef}>
            <ChatInput
              ref={chatInputRef}
              inputElementRef={chatInputElementRef}
              key={state.activeChatId ?? "new-chat"}
              onSubmit={state.handleSend}
              onCancel={() => {
                void state.handleCancel()
              }}
              disabled={!true || state.runtime?.status === "waiting_for_user"}
              canCancel={state.canCancel}
              chatId={state.activeChatId}
              projectId={projectId}
              activeProvider={state.runtime?.provider ?? null}
              availableProviders={state.availableProviders}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
