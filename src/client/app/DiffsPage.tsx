import { useOutletContext } from "react-router-dom"
import { DiffView } from "../components/diff"
import { useGitDiff } from "../hooks/useDiffExtractor"
import { RefreshCw } from "lucide-react"
import type { NomiState } from "./useNomiState"

export function DiffsPage() {
  const state = useOutletContext<NomiState>()
  const projectId = state.runtime?.projectId ?? null
  const { refetch } = useGitDiff(state.socket, projectId, true)

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-2">
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl overflow-hidden border border-border bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1 text-sm font-medium">Diffs</div>
          <button
            type="button"
            aria-label="Refresh diff"
            onClick={() => void refetch()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {projectId ? (
            <DiffView onSendAll={(message) => void state.handleSend(message)} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="text-sm">Start a chat to view diffs</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
