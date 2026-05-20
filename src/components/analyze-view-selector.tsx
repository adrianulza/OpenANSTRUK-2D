import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  LoadCase,
  LoadCaseId,
  LoadCombination,
  LoadComboId,
} from "@/lib/load-cases"

export type AnalyzeViewMode = "case" | "combination" | "envelope"

interface AnalyzeViewSelectorProps {
  combinationsEnabled: boolean
  loadCases: Record<LoadCaseId, LoadCase>
  combinations: Record<LoadComboId, LoadCombination>
  analyzeViewMode: AnalyzeViewMode
  onAnalyzeViewModeChange: (m: AnalyzeViewMode) => void
  selectedCaseId: LoadCaseId
  onSelectedCaseIdChange: (id: LoadCaseId) => void
  selectedCombinationId: LoadComboId | null
  onSelectedCombinationIdChange: (id: LoadComboId | null) => void
}

export function AnalyzeViewSelector({
  combinationsEnabled,
  loadCases,
  combinations,
  analyzeViewMode,
  onAnalyzeViewModeChange,
  selectedCaseId,
  onSelectedCaseIdChange,
  selectedCombinationId,
  onSelectedCombinationIdChange,
}: AnalyzeViewSelectorProps) {
  const cases = Object.values(loadCases)
  const combos = Object.values(combinations)

  const modeOptions: { value: AnalyzeViewMode; label: string }[] = combinationsEnabled
    ? [
        { value: "case", label: "Case" },
        { value: "combination", label: "Combination" },
        { value: "envelope", label: "Envelope" },
      ]
    : [{ value: "case", label: "Case" }]

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-100 px-2 py-1 pointer-events-auto">
      <Select
        value={analyzeViewMode}
        onValueChange={(v) => onAnalyzeViewModeChange(v as AnalyzeViewMode)}
      >
        <SelectTrigger className="h-7 text-xs min-w-[120px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modeOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {analyzeViewMode === "case" && (
        <Select value={selectedCaseId} onValueChange={onSelectedCaseIdChange}>
          <SelectTrigger className="h-7 text-xs min-w-[160px]" size="sm">
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
      )}

      {analyzeViewMode === "combination" && (
        <Select
          value={selectedCombinationId ?? ""}
          onValueChange={(v) => onSelectedCombinationIdChange(v || null)}
        >
          <SelectTrigger className="h-7 text-xs min-w-[200px]" size="sm">
            <SelectValue placeholder="Select combination…" />
          </SelectTrigger>
          <SelectContent>
            {combos.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-gray-500 italic">
                No combinations defined
              </div>
            )}
            {combos.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {analyzeViewMode === "envelope" && (
        <span className="text-[11px] text-gray-500 italic">
          max/min across {combos.filter((c) => c.enabled).length} combinations
        </span>
      )}
    </div>
  )
}
