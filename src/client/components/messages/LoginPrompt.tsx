import { useState } from "react"
import { KeyRound, ArrowRight, LoaderCircle, ExternalLink, CheckCircle, ClipboardPaste } from "lucide-react"

interface Props {
  errorMessage: string
  onSubmitApiKey: (apiKey: string) => Promise<void>
  onStartLogin: () => Promise<{ oauthUrl: string }>
  onSubmitOAuthCode: (code: string) => Promise<{ success: boolean }>
  onCheckAuthStatus: () => Promise<{ loggedIn: boolean; email?: string }>
}

export function LoginPrompt({ errorMessage, onSubmitApiKey, onStartLogin, onSubmitOAuthCode, onCheckAuthStatus }: Props) {
  const [mode, setMode] = useState<"choose" | "api-key" | "oauth" | "oauth-code">("choose")
  const [apiKey, setApiKey] = useState("")
  const [oauthCode, setOauthCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oauthUrl, setOauthUrl] = useState<string | null>(null)
  const [loginComplete, setLoginComplete] = useState(false)

  const handleApiKeySubmit = async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onSubmitApiKey(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set API key")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartOAuth = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await onStartLogin()
      setOauthUrl(result.oauthUrl)
      setMode("oauth")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start login")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitOAuthCode = async () => {
    const trimmed = oauthCode.trim()
    if (!trimmed) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await onSubmitOAuthCode(trimmed)
      if (result.success) {
        setLoginComplete(true)
      } else {
        setError("Login failed. The code may be invalid or expired. Please try again.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit code")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loginComplete) {
    return (
      <div className="px-4 py-4 mx-2 my-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-sm">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            Logged in successfully! Send a message to start chatting.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 mx-2 my-1 rounded-lg bg-muted/60 border border-border text-sm space-y-3">
      <div className="flex items-start gap-3">
        <KeyRound className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">{errorMessage}</p>
          <p className="text-muted-foreground">Choose how to authenticate with Claude.</p>
        </div>
      </div>

      {/* ── Step 1: Choose auth method ── */}
      {mode === "choose" && (
        <div className="flex gap-2">
          <button
            onClick={handleStartOAuth}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Sign in with Claude
          </button>
          <button
            onClick={() => setMode("api-key")}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Use API Key
          </button>
        </div>
      )}

      {/* ── API key input ── */}
      {mode === "api-key" && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Enter your Anthropic API key. Get one at{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              console.anthropic.com
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  e.preventDefault()
                  handleApiKeySubmit()
                }
              }}
              placeholder="sk-ant-..."
              disabled={isSubmitting}
              autoFocus
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKey.trim() || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Connect
            </button>
          </div>
          <button
            onClick={() => setMode("choose")}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* ── OAuth step 1: open the link ── */}
      {mode === "oauth" && oauthUrl && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Step 1: Sign in via browser</p>
            <a
              href={oauthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-background text-foreground text-sm font-medium hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open Sign-in Page
            </a>
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-medium">Step 2: Paste the code you receive after signing in</p>
            <button
              onClick={() => setMode("oauth-code")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ClipboardPaste className="h-4 w-4" />
              I have my code
            </button>
          </div>
          <button
            onClick={() => { setMode("choose"); setOauthUrl(null) }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors block"
          >
            Back
          </button>
        </div>
      )}

      {/* ── OAuth step 2: paste the code ── */}
      {mode === "oauth-code" && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Paste the authorization code from the sign-in page below.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={oauthCode}
              onChange={(e) => setOauthCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSubmitting) {
                  e.preventDefault()
                  handleSubmitOAuthCode()
                }
              }}
              placeholder="Paste code here..."
              disabled={isSubmitting}
              autoFocus
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
            <button
              onClick={handleSubmitOAuthCode}
              disabled={!oauthCode.trim() || isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Submit
            </button>
          </div>
          <button
            onClick={() => setMode("oauth")}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {error && (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </div>
  )
}
