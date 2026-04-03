import { KeyRound, LoaderCircle } from "lucide-react"
import type { ProcessedAuthStatusMessage } from "./types"

interface Props {
  message: ProcessedAuthStatusMessage
}

const URL_REGEX = /https?:\/\/[^\s)]+/g

function linkifyLine(line: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  for (const match of line.matchAll(URL_REGEX)) {
    const url = match[0]
    const start = match.index!
    if (start > lastIndex) {
      parts.push(line.slice(lastIndex, start))
    }
    parts.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground transition-colors"
      >
        {url}
      </a>
    )
    lastIndex = start + url.length
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }

  return parts.length > 0 ? parts : line
}

export function AuthStatusMessage({ message }: Props) {
  const hasError = Boolean(message.error)
  const isAuthenticating = message.isAuthenticating

  return (
    <div
      className={`px-4 py-3 mx-2 my-1 rounded-lg text-sm flex items-start gap-3 ${
        hasError
          ? "bg-destructive/10 border border-destructive/20 text-destructive"
          : "bg-muted/60 border border-border text-muted-foreground"
      } ${isAuthenticating ? "animate-pulse" : ""}`}
    >
      <div className="mt-0.5 flex-shrink-0">
        {isAuthenticating ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        {message.output.map((line, i) => (
          <p key={i} className="break-words">
            {linkifyLine(line)}
          </p>
        ))}
        {message.error && (
          <p className="font-medium">{message.error}</p>
        )}
      </div>
    </div>
  )
}
