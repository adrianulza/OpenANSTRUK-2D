/**
 * The one-line binding between the two design panes.
 *
 * Each pane shows a summary of what the *other* pane decided, and clicking it
 * jumps there. This is what makes the merged tool legible: a section's checks
 * are meaningless without knowing which standard and framing type produced
 * them, and the preferences are abstract until you see which section they are
 * about to be applied to.
 */

import * as React from "react"
import { ChevronRight } from "lucide-react"

interface ContextStripProps {
  /** Where clicking takes you — the pane NOT currently shown. */
  onJump: () => void
  /** Short label for the destination, e.g. "Preferences". */
  target: string
  /** Summary fields of the destination pane. Empty entries are dropped. */
  parts: (string | null | undefined)[]
  title?: string
}

export function ContextStrip({ onJump, target, parts, title }: ContextStripProps) {
  const shown = parts.filter((p): p is string => !!p && p.length > 0)
  if (shown.length === 0) return null

  return (
    <button
      type="button"
      onClick={onJump}
      title={title ?? `Go to ${target}`}
      className="w-full flex items-center gap-1 px-2 py-1 rounded bg-gray-50 border border-gray-100
                 hover:border-gray-300 hover:bg-gray-100 transition-colors text-left group"
    >
      <span className="text-[9px] uppercase tracking-wide text-gray-400 shrink-0">
        {target}
      </span>
      <span className="text-[10px] text-gray-600 truncate flex-1 min-w-0">
        {shown.join(" · ")}
      </span>
      <ChevronRight
        size={11}
        className="shrink-0 text-gray-300 group-hover:text-gray-500 transition-colors"
        aria-hidden
      />
    </button>
  )
}
