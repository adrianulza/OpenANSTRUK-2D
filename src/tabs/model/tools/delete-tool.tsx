import { cn } from "@/lib/utils"
import type { MultiSelection } from "@/lib/model"
import { Trash2 } from "lucide-react"
import { SelectionChip } from "@/components/flyout-shared"

export function DeleteComponentToolContent({
  selection,
  onDelete,
}: {
  selection: MultiSelection
  onDelete?: () => void
}) {
  const hasSelection =
    selection.nodeIds.length > 0 ||
    selection.memberIds.length > 0 ||
    selection.supportNodeIds.length > 0

  const parts: string[] = []
  if (selection.nodeIds.length > 0)
    parts.push(`${selection.nodeIds.length} node${selection.nodeIds.length > 1 ? "s" : ""}`)
  if (selection.memberIds.length > 0)
    parts.push(`${selection.memberIds.length} member${selection.memberIds.length > 1 ? "s" : ""}`)
  if (selection.supportNodeIds.length > 0)
    parts.push(`${selection.supportNodeIds.length} support${selection.supportNodeIds.length > 1 ? "s" : ""}`)
  const label = parts.length > 0 ? parts.join(", ") : "No components selected"

  return (
    <div className="space-y-3">
      <SelectionChip>{label}</SelectionChip>

      <button
        onClick={onDelete}
        disabled={!hasSelection}
        className={cn(
          "w-full flex items-center justify-center gap-2.5 py-2 px-2.5 rounded-lg transition-colors text-[13px] font-medium",
          hasSelection
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "text-gray-300 cursor-not-allowed"
        )}
      >
        <Trash2 size={15} />
        <span>Delete</span>
      </button>
    </div>
  )
}
