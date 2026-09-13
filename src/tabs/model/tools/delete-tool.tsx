import type { MultiSelection } from "@/lib/model"
import { Trash2 } from "lucide-react"
import { SelectionChip, DeleteButton } from "@/components/flyout-shared"

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

      <DeleteButton onClick={onDelete} disabled={!hasSelection}>
        <Trash2 size={14} />
        <span>Delete</span>
      </DeleteButton>
    </div>
  )
}
