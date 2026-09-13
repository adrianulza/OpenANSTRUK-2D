/**
 * A collapsible group whose *collapsed* header carries the answer.
 *
 * The design panes are dense — section, reinforcement, detailing checks, member
 * results — and most of that content is evidence rather than input. Grouping it
 * would normally trade scrolling for clicking, so each header renders a verdict
 * slot: the D/C ratio, the pass/warn/fail tally, the chosen arrangement. You
 * read the outcome collapsed and expand only to see why.
 *
 * This pairs with the Design tab's automatic runs (v1.2.0): results recompute on
 * every edit, so a collapsed header is never stale.
 */

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { designColorForDC } from "@/lib/constants"
import type { ArrangementCheck } from "@/lib/design/rc/shared/types"
import { VerdictGroupExpandAll } from "./verdict-group-context"

const NAVY = "#1a2f5e"

interface VerdictGroupProps {
  title: string
  /** Rendered at the right of the header, visible whether open or closed. */
  verdict?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

export function VerdictGroup({
  title, verdict, defaultOpen = false, children,
}: VerdictGroupProps) {
  const expandAll = React.useContext(VerdictGroupExpandAll)
  const [open, setOpen] = React.useState(expandAll ?? defaultOpen)

  return (
    <div className="rounded border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors",
          open ? "bg-gray-50" : "hover:bg-gray-50",
        )}
      >
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 text-gray-400 transition-transform duration-150",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="text-[10px] font-semibold flex-1 min-w-0 truncate" style={{ color: NAVY }}>
          {title}
        </span>
        {verdict && (
          <span className="shrink-0 text-[10px] font-mono leading-none">{verdict}</span>
        )}
      </button>
      {open && <div className="px-2 py-2 space-y-2 border-t border-gray-200">{children}</div>}
    </div>
  )
}

// ── Verdict slots ────────────────────────────────────────────────────────────

/** Plain descriptive verdict — a section name, an arrangement, a role. */
export function VerdictText({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-500">{children}</span>
}

/** A demand/capacity ratio, coloured by the same bands the canvas uses. */
export function VerdictDC({ dc, label = "D/C" }: { dc: number | undefined; label?: string }) {
  if (dc === undefined) return <span className="text-gray-300">—</span>
  const oversize = !Number.isFinite(dc)
  return (
    <span className="font-semibold" style={{ color: designColorForDC(dc) }}>
      {label} {oversize ? "O/S" : dc.toFixed(2)}
    </span>
  )
}

/** Pass / warn / fail counts. Zero-count categories are omitted, so a clean
 *  group reads simply "✓ 9" rather than "✓ 9 · ⚠ 0 · ✗ 0". */
export function VerdictTally({ checks }: { checks: ArrangementCheck[] }) {
  const t = checkTally(checks)
  if (checks.length === 0) return <span className="text-gray-300">—</span>
  return (
    <span className="space-x-1">
      {t.pass > 0 && <span className="text-green-600">✓ {t.pass}</span>}
      {t.warn > 0 && <span className="text-amber-500">⚠ {t.warn}</span>}
      {t.fail > 0 && <span className="text-red-500">✗ {t.fail}</span>}
    </span>
  )
}

/** Binary verdict for a named requirement (AISC 341 ductility, SCWB, …). */
export function VerdictStatus({ ok, okText = "OK", failText = "check" }: {
  ok: boolean
  okText?: string
  failText?: string
}) {
  return (
    <span style={{ color: ok ? "#16a34a" : "#ef4444" }} className="font-semibold">
      {ok ? okText : failText}
    </span>
  )
}

export function checkTally(checks: ArrangementCheck[]): {
  pass: number
  warn: number
  fail: number
} {
  let pass = 0, warn = 0, fail = 0
  for (const c of checks) {
    if (c.status === "pass") pass++
    else if (c.status === "warn") warn++
    else fail++
  }
  return { pass, warn, fail }
}
