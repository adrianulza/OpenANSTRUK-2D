import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { SupportType } from "@/lib/model"
import { Label } from "@/components/ui/label"
import { pinIcon, rollerIcon, fixedIcon } from "@/components/ui/support-icons"

export function SupportToolContent({
  activeSupportType,
  onSupportTypeChange,
}: {
  activeSupportType: SupportType
  onSupportTypeChange?: (t: SupportType) => void
}) {
  const btn = (type: SupportType, icon: React.ReactNode, label: string) => {
    const active = activeSupportType === type
    return (
      <button
        onClick={() => onSupportTypeChange?.(type)}
        className="flex-1 h-12 flex flex-col items-center justify-center gap-1 rounded transition-colors"
        style={active ? {
          borderWidth: 2,
          borderColor: FLYOUT_PANEL_COLORS.primary,
          backgroundColor: FLYOUT_PANEL_COLORS.primary + '0d',
          color: FLYOUT_PANEL_COLORS.primary,
        } : {
          borderWidth: 1,
          borderColor: '#e5e7eb',
          color: '#9ca3af',
        }}
      >
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    )
  }

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
