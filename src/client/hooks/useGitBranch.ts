import { useCallback, useEffect, useRef, useState } from "react"
import type { NomiSocket } from "../app/socket"

/**
 * Fetches the current git branch name from the server.
 *
 * Refetches when the socket connects, when projectId changes,
 * and on a periodic interval (30s) to stay reasonably current.
 */
export function useGitBranch(
  socket: NomiSocket | null,
  projectId: string | null | undefined,
): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  const fetchInFlightRef = useRef(false)

  const fetchBranch = useCallback(async () => {
    if (!socket || fetchInFlightRef.current) return
    fetchInFlightRef.current = true

    try {
      const result = await socket.command<{ branch: string }>({
        type: "git.branch",
        ...(projectId ? { projectId } : {}),
      })
      setBranch(result.branch || null)
    } catch (err) {
      console.warn("[useGitBranch] failed to fetch branch:", err)
      setBranch(null)
    } finally {
      fetchInFlightRef.current = false
    }
  }, [socket, projectId])

  // Fetch on mount and when dependencies change
  useEffect(() => {
    void fetchBranch()
  }, [fetchBranch])

  // Re-fetch periodically (every 30 seconds) so the branch stays current
  // after the user switches branches via terminal or external tools
  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchBranch()
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [fetchBranch])

  // Clear when projectId changes
  useEffect(() => {
    setBranch(null)
  }, [projectId])

  return branch
}
