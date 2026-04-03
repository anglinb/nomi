/**
 * VSCode reverse proxy — HTTP + WebSocket relay.
 *
 * All traffic matching `/vscode/<projectId>/*` is forwarded to the
 * corresponding VSCode child process on 127.0.0.1:<dynamicPort>.
 * This allows both nomi and VSCode to be served through a single port,
 * which is essential when running behind a reverse proxy or tunnel.
 */

import type { ServerWebSocket } from "bun"
import type { ClientState, VsCodeProxyState } from "./ws-router"

// ---------------------------------------------------------------------------
// HTTP reverse proxy
// ---------------------------------------------------------------------------

export async function proxyVsCodeHttp(
  req: Request,
  port: number,
  path: string,
  search: string,
): Promise<Response> {
  const url = `http://127.0.0.1:${port}${path}${search}`

  const headers = new Headers(req.headers)
  headers.set("host", `127.0.0.1:${port}`)
  headers.delete("connection")
  headers.delete("upgrade")

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
      // @ts-expect-error — Bun supports duplex for streaming request bodies
      duplex: req.body ? "half" : undefined,
    })

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  } catch (err) {
    console.error("[vscode-proxy] HTTP proxy error:", err)
    return new Response("VS Code server unavailable", { status: 502 })
  }
}

// ---------------------------------------------------------------------------
// WebSocket relay
// ---------------------------------------------------------------------------

/**
 * Called from the Bun `websocket.open` callback for vscode-proxy connections.
 * Establishes an upstream WebSocket to the VSCode child process and wires
 * bidirectional message relay.
 */
export function initUpstreamConnection(ws: ServerWebSocket<ClientState>): void {
  const data = ws.data as VsCodeProxyState

  let upstream: WebSocket
  try {
    upstream = new WebSocket(data.upstreamUrl)
    upstream.binaryType = "arraybuffer"
  } catch (err) {
    console.error("[vscode-proxy] Failed to create upstream WebSocket:", err)
    ws.close(1011, "Failed to connect to VS Code server")
    return
  }

  data.upstream = upstream

  upstream.addEventListener("open", () => {
    // Flush any messages that arrived before the upstream was ready
    if (data.buffer) {
      for (const msg of data.buffer) {
        upstream.send(msg)
      }
      data.buffer = null
    }
  })

  upstream.addEventListener("message", (event: MessageEvent) => {
    try {
      ws.send(event.data as string | ArrayBuffer)
    } catch {
      // Client WebSocket may have closed
    }
  })

  upstream.addEventListener("close", () => {
    try {
      ws.close()
    } catch {
      // Already closed
    }
  })

  upstream.addEventListener("error", () => {
    try {
      ws.close(1011, "VS Code upstream connection error")
    } catch {
      // Already closed
    }
  })
}

/**
 * Called from the Bun `websocket.message` callback for vscode-proxy connections.
 * Forwards the raw frame to the upstream VSCode WebSocket, or buffers it if
 * the upstream hasn't connected yet.
 */
export function relayClientMessage(
  ws: ServerWebSocket<ClientState>,
  raw: string | Buffer | ArrayBuffer | Uint8Array,
): void {
  const data = ws.data as VsCodeProxyState

  if (data.upstream && data.upstream.readyState === WebSocket.OPEN) {
    data.upstream.send(raw as string | ArrayBuffer)
  } else if (data.buffer) {
    data.buffer.push(raw as string | ArrayBuffer)
  }
  // If upstream is gone and buffer is null, drop the message (connection closing)
}

/**
 * Called from the Bun `websocket.close` callback for vscode-proxy connections.
 * Tears down the upstream WebSocket.
 */
export function cleanupUpstream(ws: ServerWebSocket<ClientState>): void {
  const data = ws.data as VsCodeProxyState

  if (data.upstream) {
    try {
      data.upstream.close()
    } catch {
      // Already closed
    }
    data.upstream = null
  }
  data.buffer = null
}
