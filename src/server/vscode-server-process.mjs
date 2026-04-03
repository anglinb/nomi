/**
 * VS Code Server child process.
 *
 * This runs under Node.js (NOT Bun) because VS Code's WebSocket upgrade
 * handling requires real Node.js net.Socket support that Bun's http
 * compatibility layer doesn't fully provide.
 *
 * Communication with the parent (Bun) process:
 *   - Parent sends:  { type: "start", cwd, userDataDir, extensionsDir, vsCodePath }
 *   - Child sends:   { type: "ready", port }
 *   - Child sends:   { type: "error", message }
 *   - Parent sends:  { type: "stop" }  (or just kills the process)
 */

import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// Prevent VS Code from auto-starting its own server
process.env.CODE_SERVER_PARENT_PID = process.pid.toString()

let vscodeApi = null
let server = null

process.on("message", async (msg) => {
  if (msg.type === "start") {
    try {
      await startServer(msg)
    } catch (error) {
      process.send({ type: "error", message: error.message || String(error) })
    }
  } else if (msg.type === "stop") {
    await shutdown()
    process.exit(0)
  }
})

/**
 * Write default VS Code settings if they don't already exist.
 * This pre-configures the editor to disable noisy dialogs and panels.
 */
function ensureDefaultSettings(userDataDir) {
  const settingsDir = path.join(userDataDir, "User")
  const settingsPath = path.join(settingsDir, "settings.json")

  fs.mkdirSync(settingsDir, { recursive: true })

  // Merge our required defaults into existing settings (or create fresh)
  let existing = {}
  try {
    existing = JSON.parse(fs.readFileSync(settingsPath, "utf8"))
  } catch {}

  {
    const defaults = {
      // Disable workspace trust dialog
      "security.workspace.trust.enabled": false,
      // Hide the secondary sidebar (Copilot Chat / "Build with Agent")
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "chat.commandCenter.enabled": false,
      "chat.editor.enabled": false,
      // Start with no open editors (no Welcome tab, no walkthrough)
      "workbench.startupEditor": "none",
      "workbench.welcomePage.walkthroughs.openOnInstall": false,
      // Disable GitHub Copilot features entirely
      "github.copilot.enable": { "*": false },
      "github.copilot.chat.enabled": false,
    }
    const merged = { ...existing, ...defaults }
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2))
  }
}

async function startServer({ vsCodePath, cwd, userDataDir, extensionsDir }) {
  // Pre-configure settings before launching
  ensureDefaultSettings(userDataDir)

  const serverMainPath = path.join(vsCodePath, "out", "server-main.js")

  let modPath = serverMainPath
  if (os.platform() === "win32") {
    modPath = "file:///" + modPath.replace(/\\/g, "/")
  }

  const mod = await import(modPath)
  const serverModule = await mod.loadCodeWithNls()

  vscodeApi = await serverModule.createServer(null, {
    "accept-server-license-terms": true,
    "without-connection-token": true,
    "disable-workspace-trust": true,
    compatibility: "1.64",
    "user-data-dir": userDataDir,
    "extensions-dir": extensionsDir,
  })

  server = http.createServer((req, res) => {
    // Intercept HTML responses to inject a startup script that hides the
    // secondary sidebar and closes the Welcome tab using VS Code's own APIs.
    const originalEnd = res.end.bind(res)
    const originalWrite = res.write.bind(res)
    const chunks = []
    let isHtml = false

    res.write = function(chunk, ...args) {
      if (isHtml) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        return true
      }
      return originalWrite(chunk, ...args)
    }

    res.writeHead = new Proxy(res.writeHead, {
      apply(target, thisArg, args) {
        const headers = args[args.length - 1]
        const contentType = typeof headers === "object" && headers !== null
          ? headers["Content-Type"] || headers["content-type"]
          : res.getHeader("content-type")
        if (typeof contentType === "string" && contentType.includes("text/html")) {
          isHtml = true
          if (typeof headers === "object" && headers !== null) {
            delete headers["Content-Length"]
            delete headers["content-length"]
          }
          res.removeHeader("content-length")
        }
        return Reflect.apply(target, thisArg, args)
      }
    })

    res.end = function(chunk, ...args) {
      if (isHtml) {
        if (chunk) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
        let html = Buffer.concat(chunks).toString("utf8")
        // Inject a script that waits for VS Code to initialize, then:
        // 1. Hides the secondary sidebar (Copilot Chat / "Build with Agent")
        // 2. Closes the Welcome/Walkthrough tab
        const injection = `<script nonce="1nline-m4p">
(function() {
  var done = { sidebar: false, tab: false };
  var attempts = 0;
  var timer = setInterval(function() {
    attempts++;
    if (attempts > 60) { clearInterval(timer); return; }
    if (done.sidebar && done.tab) { clearInterval(timer); return; }
    try {
      // Hide the secondary sidebar by clicking its toggle button
      if (!done.sidebar) {
        var btns = document.querySelectorAll('a.action-label[role="button"][aria-label]');
        for (var i = 0; i < btns.length; i++) {
          var label = btns[i].getAttribute('aria-label') || '';
          if (label.indexOf('Toggle Secondary Side Bar') !== -1 && btns[i].getAttribute('aria-pressed') === 'true') {
            btns[i].click();
            done.sidebar = true;
            break;
          }
        }
      }
      // Close walkthrough/welcome tabs
      if (!done.tab) {
        var tabs = document.querySelectorAll('[role="tab"]');
        for (var j = 0; j < tabs.length; j++) {
          var tabLabel = tabs[j].getAttribute('aria-label') || '';
          if (tabLabel.indexOf('Walkthrough') !== -1 || tabLabel.indexOf('Welcome') !== -1 || tabLabel.indexOf('Get Started') !== -1) {
            // Find the close button within the tab — it's an <a> with aria-label "Close"
            var closeBtn = tabs[j].querySelector('a[aria-label="Close"], .tab-close a, .codicon-close');
            if (closeBtn) { closeBtn.click(); done.tab = true; break; }
          }
        }
      }
    } catch(e) {}
  }, 300);
})();
</script>`
        html = html.replace("</head>", injection + "</head>")
        return originalEnd(html, ...args)
      }
      return originalEnd(chunk, ...args)
    }

    vscodeApi.handleRequest(req, res)
  })

  server.on("upgrade", (req, socket, head) => {
    if (head && head.length > 0) {
      socket.unshift(head)
    }
    vscodeApi.handleUpgrade(req, socket)
  })

  await new Promise((resolve, reject) => {
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const addr = server.address()
  process.send({ type: "ready", port: addr.port })
}

async function shutdown() {
  if (vscodeApi) {
    try { vscodeApi.dispose() } catch {}
    vscodeApi = null
  }
  if (server) {
    try { server.close() } catch {}
    server = null
  }
}

// Keep the process alive
process.on("disconnect", () => {
  shutdown().then(() => process.exit(0))
})
