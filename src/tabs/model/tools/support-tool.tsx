import * as React from "react"
import type { SupportType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { pinIcon, rollerIcon, fixedIcon } from "@/components/ui/support-icons"
import { ToggleButton } from "@/components/flyout-shared"

export function SupportToolContent({
  activeSupportType,
  onSupportTypeChange,
}: {
  activeSupportType: SupportType
  onSupportTypeChange?: (t: SupportType) => void
}) {
  const btn = (type: SupportType, icon: React.ReactNode, label: string) => (
    <ToggleButton
      active={activeSupportType === type}
      onClick={() => onSupportTypeChange?.(type)}
      className="h-12 flex flex-col items-center justify-center gap-1"
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </ToggleButton>
  )

  return (
    <div className="space-y-4">
      <Label className="text-xs text-gray-600">Support Type</Label>
      <div className="flex gap-2">
        {btn("pin", pinIcon, "Pin")}
        {btn("roller", rollerIcon, "Roller")}
        {btn("fixed", fixedIcon, "Fixed")}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">Click a node to assign</p>
    </div>
  )
}
