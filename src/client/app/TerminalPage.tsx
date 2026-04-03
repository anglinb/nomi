import { useEffect, useMemo } from "react"
import { useOutletContext } from "react-router-dom"
import { TerminalWorkspace } from "../components/chat-ui/TerminalWorkspace"
import { DEFAULT_PROJECT_TERMINAL_LAYOUT, useTerminalLayoutStore } from "../stores/terminalLayoutStore"
import { useTerminalPreferencesStore } from "../stores/terminalPreferencesStore"
import { getResolvedKeybindings } from "../lib/keybindings"
import type { NomiState } from "./useNomiState"

export function TerminalPage() {
  const state = useOutletContext<NomiState>()
  const projectId = state.runtime?.projectId ?? "default"
  const projectTerminalLayout = useTerminalLayoutStore((store) => store.projects[projectId])
  const terminalLayout = projectTerminalLayout ?? DEFAULT_PROJECT_TERMINAL_LAYOUT
  const addTerminal = useTerminalLayoutStore((store) => store.addTerminal)
  const removeTerminal = useTerminalLayoutStore((store) => store.removeTerminal)
  const setTerminalSizes = useTerminalLayoutStore((store) => store.setTerminalSizes)
  const scrollback = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const minColumnWidth = useTerminalPreferencesStore((store) => store.minColumnWidth)
  const resolvedKeybindings = useMemo(() => getResolvedKeybindings(state.keybindings), [state.keybindings])

  const hasTerminals = terminalLayout.terminals.length > 0

  // Auto-create a terminal if none exist
  useEffect(() => {
    if (!hasTerminals) {
      addTerminal(projectId)
    }
  }, [projectId, hasTerminals, addTerminal])

  if (!hasTerminals) {
    return null
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-2">
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-border bg-background">
        <TerminalWorkspace
          projectId={projectId}
          layout={terminalLayout}
          onAddTerminal={addTerminal}
          socket={state.socket}
          connectionStatus={state.connectionStatus}
          scrollback={scrollback}
          minColumnWidth={minColumnWidth}
          splitTerminalShortcut={resolvedKeybindings.bindings.addSplitTerminal}
          onRemoveTerminal={(currentProjectId, terminalId) => {
            void state.socket.command({ type: "terminal.close", terminalId }).catch(() => {})
            removeTerminal(currentProjectId, terminalId)
          }}
          onTerminalLayout={setTerminalSizes}
        />
      </div>
    </div>
  )
}
