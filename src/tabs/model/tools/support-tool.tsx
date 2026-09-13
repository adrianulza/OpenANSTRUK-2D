import * as React from "react"
import type { MultiSelection, Support, SupportPick } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { noneIcon, pinIcon, rollerIcon, fixedIcon } from "@/components/ui/support-icons"
import { ApplyButton, ToggleButton } from "@/components/flyout-shared"

export function SupportToolContent({
  activeSupportType,
  onSupportTypeChange,
  selection,
  supports,
  hoveredNodeId,
  onApply,
}: {
  activeSupportType: SupportPick
  onSupportTypeChange?: (t: SupportPick) => void
  selection?: MultiSelection
  supports?: Record<string, Support>
  hoveredNodeId?: string | null
  onApply?: (t: SupportPick) => void
}) {
  const btn = (type: SupportPick, icon: React.ReactNode, label: string) => (
    <ToggleButton
      active={activeSupportType === type}
      onClick={() => onSupportTypeChange?.(type)}
      className="h-12 flex flex-col items-center justify-center gap-1"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </ToggleButton>
  )

  const supportSelCount = selection?.supportNodeIds.length ?? 0
  const bareNodeSelCount = selection?.nodeIds.length ?? 0
  const hasSelection = supportSelCount + bareNodeSelCount > 0
  const isNone = activeSupportType === "none"

  const hoveredHasSupport = !!(hoveredNodeId && supports && supports[hoveredNodeId])

  let instruction = "Select nodes to assign supports"
  if (isNone && !hasSelection) {
    instruction = "Click a support to remove it"
  }
  if (hasSelection) {
    if (isNone) {
      // None + selection → only existing supports will be removed
      if (supportSelCount > 0 && bareNodeSelCount > 0) {
        instruction = `${supportSelCount} support${supportSelCount > 1 ? "s" : ""} will be removed (${bareNodeSelCount} bare node${bareNodeSelCount > 1 ? "s" : ""} ignored). Apply?`
      } else if (supportSelCount > 0) {
        instruction = `${supportSelCount} support${supportSelCount > 1 ? "s" : ""} selected for removal. Apply?`
      } else {
        instruction = `${bareNodeSelCount} bare node${bareNodeSelCount > 1 ? "s" : ""} selected — nothing to remove`
      }
    } else if (bareNodeSelCount > 0 && supportSelCount > 0) {
      instruction = `${bareNodeSelCount} unsupported and ${supportSelCount} supported nodes selected. Apply changes?`
    } else if (supportSelCount > 0) {
      instruction = `${supportSelCount} support${supportSelCount > 1 ? "s" : ""} selected. Apply changes?`
    } else {
      instruction = `${bareNodeSelCount} unsupported node${bareNodeSelCount > 1 ? "s" : ""} selected. Apply changes?`
    }
  } else if (hoveredHasSupport) {
    instruction = isNone ? "Click to remove this support" : "Click to change this support"
  }

  // Disable Apply when "none" is active but no existing supports are in the selection.
  const applyDisabled = isNone && supportSelCount === 0

  return (
    <div className="space-y-4">
      <Label className="text-xs text-gray-600">Boundary Condition</Label>
      <div className="grid grid-cols-4 gap-2">
        {btn("none", noneIcon, "None")}
        {btn("pin", pinIcon, "Pin")}
        {btn("roller", rollerIcon, "Roller")}
        {btn("fixed", fixedIcon, "Fixed")}
      </div>

      {hasSelection ? (
        <div className="space-y-2">
          <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 leading-relaxed whitespace-normal break-words">
            {instruction}
          </div>
          <ApplyButton
            disabled={applyDisabled}
            onClick={() => onApply?.(activeSupportType)}
          >
            Apply
          </ApplyButton>
        </div>
      ) : (
        <p className="text-xs text-gray-500 leading-relaxed">{instruction}</p>
      )}
    </div>
  )
}
