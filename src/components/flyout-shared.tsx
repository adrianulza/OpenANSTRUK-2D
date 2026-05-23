import * as React from "react"
import type { Section, SectionId } from "@/lib/model"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Pattern C toggle: bordered + faint tint when active, light gray border when inactive.
// Used for all "pick one of N" toggle rows across Model / Load tab flyouts.
export function ToggleButton({
  active,
  onClick,
  className,
  children,
  type = "button",
}: {
  active: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
  type?: "button" | "submit"
}) {
  const [hover, setHover] = React.useState(false)
  const hovered = hover && !active
  return (
    <button
      type={type}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn("flex-1 rounded transition-colors", className)}
      style={
        active
          ? {
              borderWidth: 2,
              borderColor: FLYOUT_PANEL_COLORS.primary,
              backgroundColor: FLYOUT_PANEL_COLORS.primary + "0d",
              color: FLYOUT_PANEL_COLORS.primary,
              borderStyle: "solid",
            }
          : hovered
          ? {
              borderWidth: 1,
              borderColor: FLYOUT_PANEL_COLORS.primary,
              backgroundColor: FLYOUT_PANEL_COLORS.primary + "0d",
              color: FLYOUT_PANEL_COLORS.primary,
              borderStyle: "solid",
            }
          : {
              borderWidth: 1,
              borderColor: "#e5e7eb",
              color: "#9ca3af",
              borderStyle: "solid",
            }
      }
    >
      {children}
    </button>
  )
}

// Solid blue confirmation button (Apply / Save). Standard size: h-8 text-xs.
export function ApplyButton({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-8 rounded-md text-xs font-medium transition-colors",
        className,
      )}
      style={
        disabled
          ? { backgroundColor: "#f3f4f6", color: "#9ca3af", cursor: "not-allowed" }
          : { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: "white" }
      }
    >
      {children}
    </button>
  )
}

// Bordered red destructive button (Delete). Mirrors ApplyButton sizing/shape but in
// red, with a 1px border at rest and a faint red tint on hover — consistent with the
// bordered ToggleButton style used across Model/Load flyouts.
export function DeleteButton({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-8 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-colors",
        className,
      )}
      style={
        disabled
          ? {
              borderWidth: 1,
              borderColor: "#e5e7eb",
              color: "#d1d5db",
              backgroundColor: "white",
              borderStyle: "solid",
              cursor: "not-allowed",
            }
          : {
              borderWidth: 1,
              borderColor: "#f87171",
              color: "#dc2626",
              backgroundColor: "#fef2f2",
              borderStyle: "solid",
            }
      }
      onMouseEnter={(e) => {
        if (disabled) return
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fee2e2"
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = "#dc2626"
      }}
      onMouseLeave={(e) => {
        if (disabled) return
        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fef2f2"
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = "#f87171"
      }}
    >
      {children}
    </button>
  )
}

// Square checkmark checkbox matching the GridUnitsPanel style. Filled blue when
// checked, white with gray border when unchecked. Use for include/exclude row toggles.
export function Checkbox({
  checked,
  onChange,
  disabled,
  title,
  className,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange?.(!checked)
      }}
      disabled={disabled}
      title={title}
      aria-checked={checked}
      role="checkbox"
      className={cn(
        "w-4 h-4 rounded shrink-0 flex items-center justify-center border transition-colors",
        checked
          ? "bg-[#2563eb] border-[#2563eb]"
          : "bg-white border-gray-300 hover:border-gray-400",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

// Compact selection summary chip used in DELETE / MODIFY flyouts ("N members selected").
export function SelectionChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
      {children}
    </div>
  )
}

// Simple flat section dropdown used by Model-tab tools. The richer grouped
// variant for the Material tool lives in @/tabs/model/tools/material/section-select.
export function SectionSelect({
  value,
  onChange,
  sections,
  label = "Section",
}: {
  value: SectionId
  onChange?: (id: SectionId) => void
  sections?: Record<string, Section>
  label?: string
}) {
  const items = sections
    ? Object.values(sections)
    : [
        { id: "iwf150", name: "IWF 150" },
        { id: "iwf200", name: "IWF 200" },
        { id: "wf300",  name: "WF 300"  },
      ]
  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange?.(v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          {items.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
