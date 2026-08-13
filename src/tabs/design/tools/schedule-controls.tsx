/**
 * Table controls shared by DESIGN SCHEDULE and DESIGN REPORT. Components only —
 * the constants and pure helpers live in `schedule-shared.ts`.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import type { MaterialFilter } from "./schedule-shared"

export function ToggleButton({
  active, onClick, title, disabled, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "h-7 rounded text-xs font-medium transition-colors px-1",
        disabled
          ? "border border-gray-200 text-gray-300 cursor-not-allowed"
          : active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

/** All / Concrete / Steel chips. Rendered only when the model holds both. */
export function MaterialFilterChips({
  value, onChange, show,
}: {
  value: MaterialFilter
  onChange: (v: MaterialFilter) => void
  show: boolean
}) {
  if (!show) return null
  return (
    <div className="grid grid-cols-3 gap-1">
      {([["all", "All"], ["rc", "Concrete"], ["steel", "Steel"]] as const).map(([id, label]) => (
        <ToggleButton key={id} active={value === id} onClick={() => onChange(id)}>
          {label}
        </ToggleButton>
      ))}
    </div>
  )
}
