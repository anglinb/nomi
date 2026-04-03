import { useEffect, useRef, useState } from "react"
import { Code2, Loader2, RefreshCw, X } from "lucide-react"
import type { NomiSocket, SocketStatus } from "../../app/socket"
import type { VsCodeSnapshot } from "../../../shared/protocol"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

interface VsCodePaneProps {
  projectId: string
  socket: NomiSocket
  connectionStatus: SocketStatus
  onClose?: () => void
}

export function VsCodePane({ projectId, socket, connectionStatus, onClose }: VsCodePaneProps) {
  const [snapshot, setSnapshot] = useState<VsCodeSnapshot | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const startedRef = useRef(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Subscribe to VS Code snapshot updates
  useEffect(() => {
    const unsubscribe = socket.subscribe<VsCodeSnapshot | null>(
      { type: "vscode", projectId },
      (data) => {
        setSnapshot(data)
      }
    )
    return unsubscribe
  }, [socket, projectId])

  // Start VS Code server on mount
  useEffect(() => {
    if (startedRef.current || connectionStatus !== "connected") return
    startedRef.current = true

    void socket.command({ type: "vscode.start", projectId }).catch((error) => {
      console.error("Failed to start VS Code server:", error)
    })
  }, [socket, projectId, connectionStatus])

  // Reset started ref when projectId changes
  useEffect(() => {
    startedRef.current = false
    setIframeLoaded(false)
  }, [projectId])

  const handleRetry = () => {
    startedRef.current = false
    setIframeLoaded(false)
    void socket.command({ type: "vscode.start", projectId }).catch((error) => {
      console.error("Failed to restart VS Code server:", error)
    })
  }

  const status = snapshot?.status ?? "starting"

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Minimal top bar - just enough to close/identify */}
      <div className="flex items-center gap-2 px-2 py-1 shrink-0 border-b border-border bg-background/80">
        <Code2 className="size-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">
            {status === "running" && snapshot?.port ? `VS Code — localhost:${snapshot.port}` : ""}
            {status === "starting" ? "VS Code — Starting..." : ""}
            {status === "error" ? "VS Code — Error" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {status === "error" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Retry"
              onClick={handleRetry}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close VS Code"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Content - fills all remaining space */}
      <div className="flex-1 min-h-0 relative">
        {status === "starting" && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">Starting VS Code server...</span>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full items-center justify-center">
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
              ref={iframeRef}
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
