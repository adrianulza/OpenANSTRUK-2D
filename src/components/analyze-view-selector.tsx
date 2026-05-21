import { useState, useRef, useEffect } from "react"
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
  envelopeComboIds: LoadComboId[]
  onEnvelopeComboIdsChange: (ids: LoadComboId[]) => void
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
  envelopeComboIds,
  onEnvelopeComboIdsChange,
}: AnalyzeViewSelectorProps) {
  const cases = Object.values(loadCases)
  const combos = Object.values(combinations)

  // Cases visible in the analyze view: only those marked enabled. Disabled cases
  // (their loads are skipped by the solver) shouldn't pollute the dropdown.
  const visibleCases = cases.filter((c) => c.enabled)

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
            {visibleCases.length === 0 && (
              <div className="px-2 py-1.5 text-[11px] text-gray-500 italic">
                No enabled cases
              </div>
            )}
            {visibleCases.map((c) => (
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
        <EnvelopeChecklist
          combos={combos}
          envelopeComboIds={envelopeComboIds}
          onChange={onEnvelopeComboIdsChange}
        />
      )}
    </div>
  )
}

function EnvelopeChecklist({
  combos,
  envelopeComboIds,
  onChange,
}: {
  combos: LoadCombination[]
  envelopeComboIds: LoadComboId[]
  onChange: (ids: LoadComboId[]) => void
}) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (popoverRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const included = new Set(envelopeComboIds)
  const includedCount = combos.filter((c) => included.has(c.id)).length

  const toggle = (id: LoadComboId) => {
    if (included.has(id)) onChange(envelopeComboIds.filter((x) => x !== id))
    else onChange([...envelopeComboIds, id])
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-3 text-xs rounded-md border border-gray-200 bg-white hover:bg-gray-50 min-w-[200px] text-left flex items-center justify-between gap-2"
      >
        <span className="text-gray-700">
          Envelope set: {includedCount} of {combos.length}
        </span>
        <span className="text-gray-400 text-[10px]">▾</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute top-[calc(100%+4px)] left-0 z-30 bg-white rounded-md shadow-lg border border-gray-200 p-2 min-w-[260px] max-h-[60vh] overflow-y-auto"
        >
          {combos.length === 0 ? (
            <div className="px-2 py-1.5 text-[11px] text-gray-500 italic">
              No combinations defined
            </div>
          ) : (
            <div className="space-y-1">
              {combos.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={included.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="h-3.5 w-3.5 cursor-pointer accent-[#1a2f5e]"
                  />
                  <span className="text-[11px] text-gray-700 truncate" title={c.name}>
                    {c.name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
