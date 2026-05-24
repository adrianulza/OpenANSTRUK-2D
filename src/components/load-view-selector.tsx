import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"
import type { Load } from "@/lib/model"

export const LOAD_VIEW_ALL = "__all__" as const
export type LoadViewSelection = LoadCaseId | typeof LOAD_VIEW_ALL

interface LoadViewSelectorProps {
  loadCases: Record<LoadCaseId, LoadCase>
  loads: Record<string, Load>
  value: LoadViewSelection
  onChange: (v: LoadViewSelection) => void
  disabled?: boolean
}

export function LoadViewSelector({ loadCases, loads, value, onChange, disabled }: LoadViewSelectorProps) {
  const visibleCases = Object.values(loadCases).filter((c) => c.enabled)

  // Count loads per case (one linear pass — cheap even for hundreds of loads).
  // Empty cases stay selectable so users can verify "yes, this case has nothing
  // assigned yet", but they're rendered muted so the dropdown signals at a
  // glance which cases carry data.
  const countByCase = new Map<LoadCaseId, number>()
  for (const l of Object.values(loads)) {
    countByCase.set(l.loadCaseId, (countByCase.get(l.loadCaseId) ?? 0) + 1)
  }
  const totalLoads = Object.values(loads).length

  return (
    <div className="absolute bottom-2 right-3 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-3 py-1 pointer-events-auto">
      <span className="text-xs text-gray-500 whitespace-nowrap select-none">Show Load:</span>
      <Select value={value} onValueChange={(v) => onChange(v as LoadViewSelection)} disabled={disabled}>
        <SelectTrigger className="h-7 text-xs min-w-[80px] w-auto" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LOAD_VIEW_ALL} className="text-xs">
            All Loads ({totalLoads})
          </SelectItem>
          {visibleCases.map((c) => {
            const count = countByCase.get(c.id) ?? 0
            const isEmpty = count === 0
            return (
              <SelectItem
                key={c.id}
                value={c.id}
                className={`text-xs ${isEmpty ? "text-gray-400" : ""}`}
              >
                {c.name} ({count})
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
