import { useEffect, useRef, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { useOutletContext } from "react-router-dom"
import type { VsCodeSnapshot } from "../../shared/protocol"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"
import type { NomiState } from "./useNomiState"

export function VsCodePage() {
  const state = useOutletContext<NomiState>()
  const [snapshot, setSnapshot] = useState<VsCodeSnapshot | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const startedRef = useRef(false)

  // The server resolves the default project when no projectId is provided.
  // Use "default" as a stable subscription key.
  const subscriptionProjectId = snapshot?.projectId ?? "default"

  // Subscribe to VS Code snapshot updates
  useEffect(() => {
    const unsubscribe = state.socket.subscribe<VsCodeSnapshot | null>(
      { type: "vscode", projectId: subscriptionProjectId },
      (data) => {
        setSnapshot(data)
      }
    )
    return unsubscribe
  }, [state.socket, subscriptionProjectId])

  // Start VS Code server on mount
  useEffect(() => {
    if (startedRef.current || state.connectionStatus !== "connected") return
    startedRef.current = true

    void state.socket.command({ type: "vscode.start" }).catch((error) => {
      console.error("Failed to start VS Code server:", error)
    })
  }, [state.socket, state.connectionStatus])

  const handleRetry = () => {
    startedRef.current = false
    setIframeLoaded(false)
    void state.socket.command({ type: "vscode.start" }).catch((error) => {
      console.error("Failed to restart VS Code server:", error)
    })
  }

  const status = snapshot?.status ?? "starting"

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-2">
      <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden border border-border">
        {status === "starting" && (
          <div className="flex h-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">Starting VS Code...</span>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground max-w-md text-center">
              <span className="text-sm text-destructive">
                {snapshot?.error ?? "Failed to start VS Code server"}
              </span>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="size-3.5 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {status === "running" && snapshot?.port && (
          <>
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-background">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="text-sm">Loading VS Code...</span>
                </div>
              </div>
            )}
            <iframe
              src={`http://127.0.0.1:${snapshot.port}/?folder=${encodeURIComponent(snapshot.cwd ?? "")}`}
              className={cn("w-full h-full border-0", !iframeLoaded && "opacity-0")}
              allow="clipboard-read; clipboard-write"
              onLoad={() => setIframeLoaded(true)}
              title="VS Code"
            />
          </>
        )}
      </div>
    </div>
  )
}
