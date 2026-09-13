import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"

/**
 * Compact "Case" dropdown shown above each load tool's primary content.
 * Reads/writes the active load case (for placement tools) or shows the
 * selected load's case (for Modify Load).
 */
export function CaseSelectorRow({
  label = "Case",
  loadCases,
  value,
  onChange,
  disabled,
  excludeLocked = false,
}: {
  label?: string
  loadCases: Record<LoadCaseId, LoadCase>
  value: LoadCaseId
  onChange: (id: LoadCaseId) => void
  disabled?: boolean
  /** Hide locked cases (e.g., Selfweight) from the dropdown — used by placement
   *  and modify tools, where it's nonsensical to assign a user-placed load to a
   *  body-force case. */
  excludeLocked?: boolean
}) {
  const cases = Object.values(loadCases).filter((c) => !excludeLocked || !c.locked)
  return (
    <div
      className="space-y-1.5 pb-3 border-b"
      style={{ borderBottomColor: FLYOUT_PANEL_COLORS.contentSeparator }}
    >
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-7 text-xs w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cases.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
