import { useState } from "react"
import { KeyRound, ArrowRight, LoaderCircle } from "lucide-react"

interface Props {
  errorMessage: string
  onSubmitApiKey: (apiKey: string) => Promise<void>
}

export function LoginPrompt({ errorMessage, onSubmitApiKey }: Props) {
  const [apiKey, setApiKey] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
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

  return (
    <div className="px-4 py-4 mx-2 my-1 rounded-lg bg-muted/60 border border-border text-sm space-y-3">
      <div className="flex items-start gap-3">
        <KeyRound className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">{errorMessage}</p>
          <p className="text-muted-foreground">
            Enter your Anthropic API key to connect. You can find it at{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              console.anthropic.com
            </a>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isSubmitting) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="sk-ant-..."
          disabled={isSubmitting}
          autoFocus
          className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!apiKey.trim() || isSubmitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Connect
        </button>
      </div>

      {error && (
        <p className="text-destructive text-xs">{error}</p>
      )}
    </div>
  )
}
