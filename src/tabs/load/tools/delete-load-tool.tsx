import type { StructureModel } from "@/lib/model"
import { Trash2 } from "lucide-react"
import { SelectionChip } from "@/components/flyout-shared"
import { CaseSelectorRow } from "./case-selector-row"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"

export function DeleteLoadToolContent({
  selectedLoadIds,
  model,
  onDelete,
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
}: {
  selectedLoadIds: string[]
  model?: StructureModel | null
  onDelete?: () => void
  loadCases?: Record<LoadCaseId, LoadCase>
  activeLoadCaseId?: LoadCaseId
  onActiveLoadCaseChange?: (id: LoadCaseId) => void
}) {
  const caseSelector =
    loadCases && activeLoadCaseId && onActiveLoadCaseChange ? (
      <CaseSelectorRow
        label="Filter by Load Case"
        loadCases={loadCases}
        value={activeLoadCaseId}
        onChange={onActiveLoadCaseChange}
      />
    ) : null

  if (selectedLoadIds.length === 0) {
    return (
      <div className="space-y-3">
        {caseSelector}
        <p className="text-xs text-gray-500 leading-relaxed">
          Click a load or drag a box on the canvas to select loads
        </p>
      </div>
    )
  }

  const pointCount = selectedLoadIds.filter(id => model?.loads[id]?.type === "point").length
  const distCount  = selectedLoadIds.filter(id => model?.loads[id]?.type === "distributed").length
  const parts: string[] = []
  if (pointCount > 0) parts.push(`${pointCount} point load${pointCount > 1 ? "s" : ""}`)
  if (distCount  > 0) parts.push(`${distCount} distributed load${distCount > 1 ? "s" : ""}`)

  return (
    <div className="space-y-3">
      {caseSelector}
      <SelectionChip>{parts.join(", ")} selected</SelectionChip>

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2.5 py-2 px-2.5 rounded-lg transition-colors text-[13px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
      >
        <Trash2 size={15} />
        <span>Delete {selectedLoadIds.length > 1 ? `${selectedLoadIds.length} Loads` : "Load"}</span>
      </button>
    </div>
  )
}
