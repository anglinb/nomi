import { useEffect, useRef } from "react"
import { useOutletContext, useParams } from "react-router-dom"
import { TerminalPane } from "../components/chat-ui/TerminalPane"
import { useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import type { NomiState } from "./useNomiState"

export function TerminalPage() {
  const state = useOutletContext<NomiState>()
  const { terminalId } = useParams<{ terminalId: string }>()
  const projectId = state.runtime?.projectId ?? "default"
  const addTerminal = useTerminalLayoutStore((store) => store.addTerminal)
  const scrollback = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const createdRef = useRef(false)

  // Ensure this terminal exists in the layout store
  useEffect(() => {
    if (!terminalId || createdRef.current) return
    const layout = useTerminalLayoutStore.getState().projects[projectId]
    const exists = layout?.terminals.some((t) => t.id === terminalId)
    if (!exists) {
      // The terminal was created by the sidebar — we need to register it
      // in the layout store so TerminalPane can find it.
      // But addTerminal generates its own ID, so we only create if truly missing.
      createdRef.current = true
    }
  }, [terminalId, projectId, addTerminal])

  if (!terminalId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <span className="text-sm">Select a terminal from the sidebar</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-2">
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border bg-background">
        <TerminalPane
          projectId={projectId}
          terminalId={terminalId}
          socket={state.socket}
          scrollback={scrollback}
          connectionStatus={state.connectionStatus}
        />
      </div>
    </div>
  )
}
