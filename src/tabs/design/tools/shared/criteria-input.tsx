/**
 * Labelled numeric field used by both preference panes (RC and Steel).
 *
 * Commit-on-blur rather than commit-on-change: these are code-level constants
 * (φ factors, yield stresses), and a half-typed "4" on the way to "420" must
 * never reach the engine. Out-of-range values clamp instead of being rejected.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function CriteriaInput({
  label, symbol, value, unit, min, max, integer, onCommit,
}: {
  label: string
  symbol: string
  value: number
  unit: string
  min?: number
  max?: number
  integer?: boolean
  onCommit: (v: number) => void
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])

  const commit = () => {
    let n = parseFloat(text)
    if (!Number.isFinite(n)) {
      setText(String(value))
      return
    }
    if (integer) n = Math.round(n)
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    setText(String(n))
    if (n !== value) onCommit(n)
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">
        {label}, <span className="font-medium text-[#1a2f5e]">{symbol}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className={cn(
            "h-7 text-xs font-mono flex-1 min-w-0",
            !Number.isFinite(parseFloat(text)) && "border-red-400 focus-visible:ring-red-300",
          )}
        />
        <span className="text-xs text-gray-500 w-8 shrink-0 text-right">{unit}</span>
      </div>
    </div>
  )
}
