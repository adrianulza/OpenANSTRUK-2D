import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"

export const LOAD_VIEW_ALL = "__all__" as const
export type LoadViewSelection = LoadCaseId | typeof LOAD_VIEW_ALL

interface LoadViewSelectorProps {
  loadCases: Record<LoadCaseId, LoadCase>
  value: LoadViewSelection
  onChange: (v: LoadViewSelection) => void
}

export function LoadViewSelector({ loadCases, value, onChange }: LoadViewSelectorProps) {
  const visibleCases = Object.values(loadCases).filter((c) => c.enabled)

  return (
    <div className="absolute bottom-2 right-3 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-3 py-1 pointer-events-auto">
      <span className="text-xs text-gray-500 whitespace-nowrap select-none">Show Load:</span>
      <Select value={value} onValueChange={(v) => onChange(v as LoadViewSelection)}>
        <SelectTrigger className="h-7 text-xs min-w-[160px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LOAD_VIEW_ALL} className="text-xs">
            All Loads
          </SelectItem>
          {visibleCases.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
