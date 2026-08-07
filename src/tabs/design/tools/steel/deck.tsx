/**
 * Shell and small parts shared by the two steel Advanced Report decks.
 *
 * The deck is a portal anchored to the right edge of the flyout — the same
 * `[data-flyout-root]` measure pattern the RC decks use, so both materials'
 * reports appear in the same place and track the same resize/scroll events.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { COLOR_DESIGN_FAIL } from "@/lib/constants"
import { DECK_WIDTH } from "../chart-utils"

export const NAVY = "#1a2f5e"
export const GREEN = "#16a34a"
export const AMBER = "#d97706"
export const FAIL = COLOR_DESIGN_FAIL
const PILL_WIDTH = 3

/** Position the deck beside the flyout and keep it there. */
export function useDeckAnchor(open: boolean) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return
    const root = document.querySelector<HTMLElement>("[data-flyout-root]")
    if (!root) return
    const update = () => {
      const r = root.getBoundingClientRect()
      setPos({ left: r.right + PILL_WIDTH, top: r.top })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(root)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open])
  return pos
}

export function ReportDeck({
  open, title, children,
}: {
  open: boolean
  title: string
  children: React.ReactNode
}) {
  const pos = useDeckAnchor(open)
  if (!open || typeof document === "undefined" || !pos) return null
  return createPortal(
    <div
      className={cn(
        "fixed bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100dvh-5rem)]",
      )}
      style={{ left: pos.left, top: pos.top, width: DECK_WIDTH }}
    >
      <div className="pl-7 pr-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-[#1a2f5e] block">{title}</span>
      </div>
      <div className="p-3 pl-7 overflow-y-auto space-y-3">{children}</div>
    </div>,
    document.body,
  )
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-gray-200 px-2.5 py-2 space-y-1.5">
      <p className="text-[10px] font-semibold" style={{ color: NAVY }}>{title}</p>
      {children}
    </div>
  )
}

/** Two-column definition row used throughout both decks. */
export function DRow({
  label, value, mono = true, color, strong,
}: {
  label: React.ReactNode
  value: React.ReactNode
  mono?: boolean
  color?: string
  strong?: boolean
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={cn("text-right", mono && "font-mono", strong && "font-semibold")}
        style={color ? { color } : undefined}
      >
        {value}
      </dd>
    </>
  )
}

export function DList({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">{children}</dl>
}

/**
 * Capacity-utilisation bar: available strength as the track, demand as a marker.
 * Reads left-to-right as "how much of this is used", which is the question a
 * D/C number answers but does not show.
 */
export function UtilBar({
  label, capacity, demand, unit,
}: {
  label: React.ReactNode
  capacity: number
  demand: number
  unit: string
}) {
  const ratio = capacity > 0 ? demand / capacity : demand > 0 ? Infinity : 0
  const pct = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 1))
  const over = ratio > 1
  const color = over ? FAIL : ratio > 0.9 ? AMBER : NAVY
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-[10px]">
        <span className="text-gray-500">{label}</span>
        <span className="font-mono" style={{ color }}>
          {demand.toFixed(1)} / {Number.isFinite(capacity) ? capacity.toFixed(1) : "—"} {unit}
          {"  "}
          <span className="font-semibold">
            ({Number.isFinite(ratio) ? ratio.toFixed(3) : "O/S"})
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded bg-gray-100 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{ width: `${pct * 100}%`, background: color, opacity: 0.85 }}
        />
        {/* the unity mark — where the section runs out */}
        <div className="absolute inset-y-0 right-0 w-px bg-gray-400" />
      </div>
    </div>
  )
}

/** Limit-state ladder row: the candidate strengths, governing one highlighted. */
export function LadderRow({
  name, clause, value, unit, governs,
}: {
  name: string
  clause: string
  value: number | undefined
  unit: string
  governs: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-2 rounded px-1.5 py-0.5 text-[10px]",
        governs && "bg-[#1a2f5e]/5",
      )}
    >
      <span
        className={cn("flex-1", governs ? "font-semibold" : "text-gray-500")}
        style={governs ? { color: NAVY } : undefined}
      >
        {name}
      </span>
      <span className="font-mono text-[9px] text-gray-400">{clause}</span>
      <span
        className={cn("font-mono w-24 text-right", governs && "font-semibold")}
        style={governs ? { color: NAVY } : undefined}
      >
        {value !== undefined && Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : "—"}
      </span>
    </div>
  )
}
